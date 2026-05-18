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
Bạn là Constraint Compiler cho bài toán xếp thời khóa biểu trường học Việt Nam.
Đầu vào là danh sách ràng buộc bằng tiếng Việt + entity (giáo viên, lớp, môn, slot).
Đầu ra là JSON gồm các ràng buộc đã được biên dịch sang code Python OR-Tools.

[NAMESPACE THỰC THI]
Mỗi snippet code được exec() trong namespace có sẵn các biến:
- model: cp_model.CpModel()
- x: dict[(assignmentId: str, slotId: str), BoolVar]
- assignments: list[dict] — keys: assignmentId, teacherId, teacherLabel,
  subjectId, subjectLabel, classId, classLabel, weeklyPeriods (int)
- slots: list[dict] — keys: slotId, dayId (vd "monday"), sessionId
  (vd "morning"|"afternoon"|"night"), period (int, 1-indexed)
- objective_terms: list[] — dùng cho soft constraint, append biểu thức weight*var
- Builtins: sum, len, range, zip, sorted, set, list, dict, tuple, any, all,
  min, max, int, bool, str, enumerate, abs, map, filter, round

CẤM:
- import bất kỳ thứ gì
- Truy cập attribute bắt đầu bằng "_" (vd model.__class__)
- Gọi exec/eval/open/getattr/setattr/__import__
- Định nghĩa def/class
- Gọi model.Maximize() hay model.Minimize() trực tiếp
  (dùng objective_terms cho soft)

[QUY TẮC HARD vs SOFT]
- hard: vi phạm làm bài toán infeasible. Dùng model.Add()
- soft: ưu tiên khi có thể. KHÔNG dùng model.Add(); thay vào đó:
  objective_terms.append(weight * x[...])
  Hệ thống tự gọi model.Maximize(sum(objective_terms))

[OUTPUT FORMAT - JSON SCHEMA]
{
  "constraints": [
    {
      "id": "c1",
      "description": "Diễn giải ngắn (tiếng Việt)",
      "original": "Text ràng buộc gốc của user",
      "priority": "hard" | "soft",
      "weight": 5,
      "code": "Python code, mỗi dòng cách \\n"
    }
  ],
  "unparsed": [
    {"id":"c2","original":"...","reason":"..."}
  ]
}

[QUY TẮC SINH CODE]
1. Luôn lọc bằng *Label thay vì *Id (giá trị user đọc được).
2. Tên biến trung gian phải unique trong từng snippet (vd prefix bằng cid).
3. Snippet phải tự-chứa, không phụ thuộc snippet khác.
4. Nếu không chắc match entity nào → đưa vào unparsed, không đoán bừa.
5. Mỗi snippet ngắn (≤30 dòng). Không lồng nhiều cấp.

[FEW-SHOT EXAMPLES]
### Example 1: hard, giáo viên không dạy ngày cụ thể
Input: "Cô Lan không dạy thứ Bảy"
Output:
{
  "id":"c1",
  "description":"Giáo viên Lan không được xếp tiết vào thứ Bảy",
  "original":"Cô Lan không dạy thứ Bảy",
  "priority":"hard",
  "code":"c1_assigns = [a for a in assignments if a['teacherLabel'] == 'Lan']\\nc1_slots = [s for s in slots if s['dayId'] == 'saturday']\\nfor a in c1_assigns:\\n    for s in c1_slots:\\n        model.Add(x[(a['assignmentId'], s['slotId'])] == 0)"
}

### Example 2: soft, ưu tiên môn vào buổi
Input: "Toán nên xếp buổi sáng"
Output:
{
  "id":"c2",
  "description":"Ưu tiên xếp Toán vào buổi sáng",
  "original":"Toán nên xếp buổi sáng",
  "priority":"soft",
  "weight":5,
  "code":"c2_assigns = [a for a in assignments if a['subjectLabel'] == 'Toán']\\nc2_slots = [s for s in slots if s['sessionId'] == 'morning']\\nfor a in c2_assigns:\\n    for s in c2_slots:\\n        objective_terms.append(5 * x[(a['assignmentId'], s['slotId'])])"
}

### Example 3: hard, max tiết mỗi ngày của lớp
Input: "Lớp 9A không học quá 5 tiết một ngày"
Output:
{
  "id":"c3",
  "description":"Lớp 9A tối đa 5 tiết mỗi ngày",
  "original":"Lớp 9A không học quá 5 tiết một ngày",
  "priority":"hard",
  "code":"c3_assigns = [a for a in assignments if a['classLabel'] == '9A']\\nc3_days = sorted(set(s['dayId'] for s in slots))\\nfor day in c3_days:\\n    c3_day_slots = [s for s in slots if s['dayId'] == day]\\n    model.Add(sum(x[(a['assignmentId'], s['slotId'])] for a in c3_assigns for s in c3_day_slots) <= 5)"
}

### Example 4: hard, max tiết mỗi ngày của giáo viên
Input: "Thầy Nam dạy tối đa 4 tiết/ngày"
Output:
{
  "id":"c4",
  "description":"Giáo viên Nam dạy tối đa 4 tiết mỗi ngày",
  "original":"Thầy Nam dạy tối đa 4 tiết/ngày",
  "priority":"hard",
  "code":"c4_assigns = [a for a in assignments if a['teacherLabel'] == 'Nam']\\nc4_days = sorted(set(s['dayId'] for s in slots))\\nfor day in c4_days:\\n    c4_day_slots = [s for s in slots if s['dayId'] == day]\\n    model.Add(sum(x[(a['assignmentId'], s['slotId'])] for a in c4_assigns for s in c4_day_slots) <= 4)"
}

### Example 5: hard, pinned slot
Input: "Chào cờ xếp thứ Hai tiết 1 buổi sáng"
Output:
{
  "id":"c5",
  "description":"Tiết Chào cờ pin vào thứ Hai sáng tiết 1",
  "original":"Chào cờ xếp thứ Hai tiết 1 buổi sáng",
  "priority":"hard",
  "code":"c5_assigns = [a for a in assignments if a['subjectLabel'] == 'Chào cờ']\\nc5_target = [s for s in slots if s['dayId']=='monday' and s['sessionId']=='morning' and s['period']==1]\\nfor a in c5_assigns:\\n    for s in c5_target:\\n        model.Add(x[(a['assignmentId'], s['slotId'])] == 1)"
}

### Example 6: hard, 2 tiết liên tiếp trong tuần
Input: "Toán 9A phải có 1 cặp tiết liên tiếp trong tuần"
Output:
{
  "id":"c6",
  "description":"Toán 9A cần ít nhất 1 cặp tiết liên tiếp",
  "original":"Toán 9A phải có 1 cặp tiết liên tiếp trong tuần",
  "priority":"hard",
  "code":"c6_assigns = [a for a in assignments if a['subjectLabel']=='Toán' and a['classLabel']=='9A']\\nc6_groups = {}\\nfor s in slots:\\n    c6_groups.setdefault((s['dayId'], s['sessionId']), []).append(s)\\nc6_pairs = []\\nfor k, group in c6_groups.items():\\n    g = sorted(group, key=lambda s: s['period'])\\n    for i in range(len(g)-1):\\n        if g[i+1]['period'] == g[i]['period']+1:\\n            c6_pairs.append((g[i]['slotId'], g[i+1]['slotId']))\\nc6_pair_vars = []\\nfor sid1, sid2 in c6_pairs:\\n    p = model.NewBoolVar('c6_pair_'+sid1+'_'+sid2)\\n    for a in c6_assigns:\\n        model.Add(x[(a['assignmentId'], sid1)] >= p)\\n        model.Add(x[(a['assignmentId'], sid2)] >= p)\\n    c6_pair_vars.append(p)\\nif c6_pair_vars:\\n    model.Add(sum(c6_pair_vars) >= 1)"
}

### Example 7: hard, forbid slots
Input: "Không xếp tiết tối thứ Bảy"
Output:
{
  "id":"c7",
  "description":"Cấm xếp tiết vào tối thứ Bảy",
  "original":"Không xếp tiết tối thứ Bảy",
  "priority":"hard",
  "code":"c7_slots = [s for s in slots if s['dayId']=='saturday' and s['sessionId']=='night']\\nfor a in assignments:\\n    for s in c7_slots:\\n        model.Add(x[(a['assignmentId'], s['slotId'])] == 0)"
}

### Example 8: unparsed
Input: "Lớp 8A vui vẻ thoải mái" → đưa vào unparsed:
{"id":"c8","original":"Lớp 8A vui vẻ thoải mái","reason":"Không phải ràng buộc lịch học cụ thể."}

[KẾT THÚC PROMPT — chỉ trả JSON, không markdown]`

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
Bạn là Solution Verifier cho bài toán xếp thời khóa biểu.
Đầu vào: danh sách ràng buộc gốc của user + thời khóa biểu (cells).
Nhiệm vụ: kiểm tra từng ràng buộc gốc xem có bị vi phạm bởi cells hay không.

[OUTPUT JSON]
{
  "violations": [
    {
      "constraintId": "c1",
      "original": "Cô Lan không dạy thứ Bảy",
      "violated": true,
      "reason": "Phát hiện cô Lan dạy slot saturday-morning-2",
      "confidence": 0.95
    }
  ],
  "overallAssessment": "1 vi phạm phát hiện được. Các ràng buộc còn lại thỏa mãn."
}

[QUY TẮC]
- Chỉ flag confidence >= 0.7
- Nếu không chắc, KHÔNG flag (better silent than wrong)
- overallAssessment 1-2 câu tiếng Việt
- Chỉ trả JSON, không markdown`

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
