import type { ModelRequestPreview } from './types'

// ---------------------------------------------------------------------------
// Legacy helpers (kept for backward compat)
// ---------------------------------------------------------------------------

export function buildTimetablePayload(input: any) {
  const { days: selectedDays, sessions: selectedSessions, periodCounts, deletedPeriods, assignments, constraints } = input

  const timetableSlots = selectedDays.map((day: any) => ({
    id: day.id,
    label: day.label,
    slots: selectedSessions.flatMap((session: any) => {
      const count = periodCounts[session.id]
      return Array.from({ length: count }, (_, index) => {
        const period = index + 1
        const key = `${day.id}-${session.id}-${period}`
        if (deletedPeriods[key]) return []
        return [{
          dayId: day.id,
          dayLabel: day.label,
          sessionId: session.id,
          sessionLabel: session.label,
          period,
          slotId: key,
        }]
      }).flat()
    }),
  }))

  return {
    khung_thoi_khoa_bieu: timetableSlots,
    phan_cong_chuyen_mon: assignments.map((assignment: any) => ({
      giao_vien: assignment.teacher,
      mon_hoc: assignment.subject,
      lop: assignment.className,
      so_tiet_moi_tuan: assignment.weeklyPeriods,
    })),
    rang_buoc_xep_lich: constraints.map((constraint: any) => ({
      loai: constraint.type === 'required' ? 'Bắt buộc' : 'Nên có',
      noi_dung: constraint.text,
    })),
  }
}

export function buildTimetablePrompts(input: any) {
  const summarizedInput = buildTimetablePayload(input)

  const systemPrompt = 'Bạn nhận dữ liệu thời khóa biểu đã được cấu trúc. Nhiệm vụ của bạn là diễn giải hoặc chuẩn hóa ràng buộc bằng tiếng Việt ngắn gọn khi cần. Không sinh mã nguồn, không giả định đang thực thi solver, không trả markdown dài dòng.'

  const userPrompt = `Hãy đọc dữ liệu JSON sau và diễn giải ngắn gọn các ràng buộc hoặc điểm cần chú ý nếu được yêu cầu. Dữ liệu solve chính sẽ được xử lý nội bộ.\n\n${JSON.stringify(summarizedInput, null, 2)}`

  return { systemPrompt, userPrompt }
}

// ---------------------------------------------------------------------------
// NEW: AI Constraint Compiler prompts
// ---------------------------------------------------------------------------

const COMPILER_SYSTEM_PROMPT = `[ROLE]
Constraint compiler for Vietnamese school timetabling.

[REQUIRED OUTPUT]
Return JSON only (no markdown) with shape:
{
  "constraints": [{"id":"...","description":"...","original":"...","priority":"hard|soft","weight":5,"code":"..."}],
  "unparsed": [{"id":"...","original":"...","reason":"..."}]
}

[NAMESPACE]
- model, x, assignments, slots, objective_terms are pre-defined.
- Use readable labels (*Label) for matching user entities.

[SAFETY]
- NO import/exec/eval/open/getattr/setattr/__import__.
- NO attribute access starting with "_".
- NO def/class definitions.
- NO model.Maximize()/Minimize() directly.

[HARD vs SOFT]
- hard => use model.Add(...).
- soft => do not Add hard restriction; append to objective_terms with weight * x[...].

[CODE RULES]
- Each snippet must be self-contained and short.
- Variable names unique per constraint id.
- If entity/intent is ambiguous => push to unparsed (do not guess).
- Return strict JSON only.`

export function buildCompilerPrompts(input: {
  entities: {
    teachers: string[]
    subjects: string[]
    classes: string[]
    dayIds: string[]
    sessionIds: string[]
  }
  rawConstraints: Array<{ id: string; priority: string; text: string }>
}): ModelRequestPreview {
  const userContent = JSON.stringify({
    entities: input.entities,
    rawConstraints: input.rawConstraints.map((c) => ({
      id: c.id,
      priority: c.priority,
      text: c.text,
    })),
    context:
      "Lưu ý: priority='required' → ưu tiên dịch thành hard. preferred → soft.",
  })

  return {
    model: 'devstral-latest',
    temperature: 0,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'timetable_constraint_compile',
        schema: {
          type: 'object',
          properties: {
            constraints: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  description: { type: 'string' },
                  original: { type: 'string' },
                  priority: { type: 'string', enum: ['hard', 'soft'] },
                  weight: { type: 'number' },
                  code: { type: 'string' },
                },
                required: ['id', 'description', 'original', 'priority', 'code'],
              },
            },
            unparsed: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  original: { type: 'string' },
                  reason: { type: 'string' },
                },
                required: ['id', 'original', 'reason'],
              },
            },
          },
          required: ['constraints', 'unparsed'],
          additionalProperties: false,
        },
      },
    },
    messages: [
      { role: 'system', content: COMPILER_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
  }
}

// ---------------------------------------------------------------------------
// NEW: AI Verifier prompts
// ---------------------------------------------------------------------------

const VERIFIER_SYSTEM_PROMPT = `[ROLE]
Solution verifier for timetable constraints.

[INPUT]
- rawConstraints + compiledConstraints metadata + timetable cells + entities.

[REQUIRED OUTPUT JSON]
{
  "violations": [
    {
      "constraintId":"c1",
      "original":"...",
      "violated":true,
      "reason":"...",
      "confidence":0.95
    }
  ],
  "overallAssessment":"..."
}

[RULES]
- Flag only when confidence >= 0.7.
- If uncertain, do not flag.
- overallAssessment must be concise Vietnamese (1-2 sentences).
- JSON only, no markdown.`

export function buildVerifierPrompts(args: {
  rawConstraints: Array<{ id: string; text: string; priority: string }>
  cells: Array<{
    slotId: string
    dayId: string
    sessionId: string
    period: number
    entries: Array<{
      assignmentKey: string
      subject: string
      teacher: string
      className: string
    }>
  }>
  compiledConstraints: Array<{
    id: string
    description: string
    original: string
    priority: string
    code: string
  }>
  entities: {
    teachers: string[]
    subjects: string[]
    classes: string[]
  }
}): ModelRequestPreview {
  const userContent = JSON.stringify({
    rawConstraints: args.rawConstraints,
    cells: args.cells,
    compiledConstraints: args.compiledConstraints.map((c) => ({
      id: c.id,
      description: c.description,
      original: c.original,
      priority: c.priority,
    })),
    entities: args.entities,
  })

  return {
    model: 'devstral-latest',
    temperature: 0,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'timetable_verify',
        schema: {
          type: 'object',
          properties: {
            violations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  constraintId: { type: 'string' },
                  original: { type: 'string' },
                  violated: { type: 'boolean' },
                  reason: { type: 'string' },
                  confidence: { type: 'number' },
                },
                required: [
                  'constraintId',
                  'original',
                  'violated',
                  'reason',
                  'confidence',
                ],
              },
            },
            overallAssessment: { type: 'string' },
          },
          required: ['violations', 'overallAssessment'],
          additionalProperties: false,
        },
      },
    },
    messages: [
      { role: 'system', content: VERIFIER_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
  }
}
