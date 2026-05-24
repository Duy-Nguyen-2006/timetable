export const SYSTEM_PROMPT = `Bạn là AI hỗ trợ xếp thời khóa biểu Việt Nam.

[INPUT]
- slots, assignments, hardConstraints, softConstraints (JSON).

[MANDATORY RULES]
1) Mỗi assignment phải có đúng weeklyPeriods slot.
2) Giáo viên không trùng giờ theo slotId.
3) Lớp không trùng giờ theo slotId.
4) Mapping ngày bắt buộc chính xác:
   - thứ 2->monday, thứ 3->tuesday, thứ 4->wednesday, thứ 5->thursday, thứ 6->friday, thứ 7->saturday, chủ nhật->sunday.
5) Hard constraints dùng assumptions/IIS khi infeasible.
6) Soft constraints dùng indicator + weight trong objective maximize.

[OUTPUT]
- BẮT BUỘC trả Python code hoàn chỉnh dùng OR-Tools CP-SAT.
- Không output JSON trực tiếp.
- Chỉ dùng ortools, json, sys.
- Không in gì ngoài JSON kết quả cuối cùng ra stdout.`

export type InputPayload = {
  slots: Array<{
    id: string
    dayId: string
    dayLabel: string
    sessionId: string
    sessionLabel: string
    period: number
  }>
  assignments: Array<{
    id: string
    teacherId: string
    teacherLabel: string
    classId: string
    classLabel: string
    subjectId: string
    subjectLabel: string
    weeklyPeriods: number
  }>
  hardConstraints: Array<{ id: string; text: string }>
  softConstraints: Array<{ id: string; text: string; weight: number }>
}

export function buildInputPayload(input: {
  days: Array<{ id: string; label: string }>
  sessions: Array<{ id: string; label: string }>
  periodCounts: Record<string, number>
  deletedPeriods: Record<string, boolean>
  assignments: Array<{ teacher: string; subject: string; className: string; weeklyPeriods: number | string }>
  constraints: Array<{ type: 'required' | 'preferred'; text: string }>
}): InputPayload {
  const { days, sessions, periodCounts, deletedPeriods, assignments, constraints } = input

  const slots: InputPayload['slots'] = []
  for (const day of days) {
    for (const session of sessions) {
      const count = periodCounts[session.id] ?? 0
      for (let i = 0; i < count; i++) {
        const period = i + 1
        const key = `${day.id}-${session.id}-${period}`
        if (deletedPeriods[key]) continue
        slots.push({ id: key, dayId: day.id, dayLabel: day.label, sessionId: session.id, sessionLabel: session.label, period })
      }
    }
  }

  const teacherToId = new Map<string, string>()
  const subjectToId = new Map<string, string>()
  const classToId = new Map<string, string>()

  const builtAssignments: InputPayload['assignments'] = assignments.map((a, index) => {
    if (!teacherToId.has(a.teacher)) teacherToId.set(a.teacher, `T${teacherToId.size + 1}`)
    if (!subjectToId.has(a.subject)) subjectToId.set(a.subject, `S${subjectToId.size + 1}`)
    if (!classToId.has(a.className)) classToId.set(a.className, `C${classToId.size + 1}`)
    return {
      id: `asg_${index}`,
      teacherId: teacherToId.get(a.teacher)!,
      teacherLabel: a.teacher,
      classId: classToId.get(a.className)!,
      classLabel: a.className,
      subjectId: subjectToId.get(a.subject)!,
      subjectLabel: a.subject,
      weeklyPeriods: Number(a.weeklyPeriods),
    }
  })

  const hardConstraints: InputPayload['hardConstraints'] = []
  const softConstraints: InputPayload['softConstraints'] = []
  for (let i = 0; i < constraints.length; i++) {
    const c = constraints[i]
    if (c.type === 'required') {
      hardConstraints.push({ id: `hc_${i + 1}`, text: c.text })
    } else {
      softConstraints.push({ id: `sc_${i + 1}`, text: c.text, weight: 5 })
    }
  }

  return { slots, assignments: builtAssignments, hardConstraints, softConstraints }
}

export const CONSTRAINT_COMPILER_PROMPT = `Bạn biên dịch ràng buộc sang Python snippets cho OR-Tools CP-SAT.

[NAMESPACE]
- model, x, assignments, slots, objective_terms đã có sẵn.

[MANDATORY RULES]
1) Không import/print/sys và không sửa x/assignments/slots.
2) Không dùng f-string.
3) Hard: model.Add(...).
4) Soft: objective_terms.append(x[...] * weight).
5) Chỉ dùng API an toàn: model.Add, model.AddBoolOr, model.AddBoolAnd, model.NewBoolVar, model.AddAtMostOne.
6) Mapping ngày bắt buộc: thứ 2->monday ... thứ 7->saturday.
7) Viết checker_code song song; dòng cuối: result = (satisfied, reason).

[VÍ DỤ SOFT — "Toán nên xếp tiết 1-2" (weight 3)]:
for a in assignments:
    if a['subjectLabel'] == 'Toán':
        for s in slots:
            if s['period'] <= 2:
                objective_terms.append(x[(a['assignmentId'], s['slotId'])] * 3)

[VÍ DỤ SOFT — "Lý nên dạy buổi sáng" (weight 4)]:
for a in assignments:
    if a['subjectLabel'] == 'Lý':
        for s in slots:
            if s['sessionId'] == 'morning':
                objective_terms.append(x[(a['assignmentId'], s['slotId'])] * 4)

[CHECKER CODE — BẮT BUỘC]:
Song song với code OR-Tools, viết checker_code kiểm tra solution sau khi solve.
Namespace checker: cells_map: dict[(assignmentId, slotId)] -> bool, assignments, slots (giống namespace chính).
KHÔNG dùng f-string. KHÔNG import. KHÔNG print.
Dòng cuối PHẢI là: result = (satisfied, reason) — satisfied: bool, reason: str tiếng Việt.

Ví dụ checker hard "Sơn không dạy thứ 2":
satisfied = True
reason = "Thỏa mãn"
for a in assignments:
    if a['teacherLabel'] == 'Sơn':
        for s in slots:
            if s['dayId'] == 'monday' and cells_map.get((a['assignmentId'], s['slotId']), False):
                satisfied = False
                reason = 'Sơn dạy ' + a['subjectLabel'] + ' lớp ' + a['classLabel'] + ' vào thứ 2'
result = (satisfied, reason)

Ví dụ checker hard "9A không học thứ 7":
satisfied = True
reason = "Thỏa mãn"
for a in assignments:
    if a['classLabel'] == '9A':
        for s in slots:
            if s['dayId'] == 'saturday' and cells_map.get((a['assignmentId'], s['slotId']), False):
                satisfied = False
                reason = '9A học ' + a['subjectLabel'] + ' vào thứ 7'
result = (satisfied, reason)

Ví dụ checker soft "Toán nên xếp tiết 1-2":
total = 0
preferred = 0
for a in assignments:
    if a['subjectLabel'] == 'Toán':
        for s in slots:
            if cells_map.get((a['assignmentId'], s['slotId']), False):
                total += 1
                if s['period'] <= 2:
                    preferred += 1
satisfied = total == 0 or preferred * 2 >= total
reason = 'Thỏa mãn' if satisfied else str(preferred) + '/' + str(total) + ' tiết Toán ở tiết 1-2'
result = (satisfied, reason)

Ví dụ checker soft "Lý nên dạy buổi sáng":
total = 0
morning = 0
for a in assignments:
    if a['subjectLabel'] == 'Lý':
        for s in slots:
            if cells_map.get((a['assignmentId'], s['slotId']), False):
                total += 1
                if s['sessionId'] == 'morning':
                    morning += 1
satisfied = total == 0 or morning * 2 >= total
reason = 'Thỏa mãn' if satisfied else str(morning) + '/' + str(total) + ' tiết Lý vào buổi sáng'
result = (satisfied, reason)

[OUTPUT] JSON array thuần, KHÔNG markdown, KHÔNG giải thích:
[
  {
    "id": "hc_1",
    "original": "text gốc",
    "description": "mô tả ngắn tiếng Việt",
    "priority": "hard",
    "code": "python OR-Tools code, dùng \\n cho newline, \\' cho dấu nháy đơn",
    "checker_code": "python checker code, dùng \\n cho newline, \\' cho dấu nháy đơn"
  },
  {
    "id": "sc_1",
    "original": "text gốc",
    "description": "mô tả ngắn",
    "priority": "soft",
    "weight": 3,
    "code": "python code",
    "checker_code": "python checker code"
  }
]`

type CompilerMessageOptions = {
  focusTexts?: string[]
  includeAllContext?: boolean
}

function normalizeText(input: string): string {
  return input
    .toLocaleLowerCase('vi-VN')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function selectRelevantValues(values: string[], haystack: string): string[] {
  const selected = values.filter((value) => {
    const raw = value.trim()
    if (!raw) return false
    const lowerRaw = raw.toLocaleLowerCase('vi-VN')
    const normalizedRaw = normalizeText(raw)
    return haystack.includes(lowerRaw) || haystack.includes(normalizedRaw)
  })
  return selected.length > 0 ? selected : values.slice(0, 12)
}

export const VIOLATION_ENRICH_PROMPT = `Bạn là AI phân tích xung đột ràng buộc thời khóa biểu.

[INPUT] JSON với:
- allConstraints: danh sách tất cả ràng buộc (id, text, priority)
- violations: danh sách ràng buộc bị vi phạm (constraintId, original, violated, reason)

[NHIỆM VỤ]:
Với MỖI vi phạm, xác định MỘT ràng buộc khác (id từ allConstraints) có khả năng cao nhất gây ra xung đột, và đề xuất ngắn cách điều chỉnh để khắc phục.
- Nếu vi phạm là hard (violated=true): nêu lý do thực tế (ví dụ: trùng giáo viên, không đủ slot).
- Nếu vi phạm là soft (violated=false): nêu ràng buộc nào có ảnh hưởng cao hơn khiến soft không tối ưu được.

[OUTPUT] JSON array thuần (không markdown, không giải thích):
[
  {"constraintId":"sc_1","conflictsWith":"\\"text gốc của ràng buộc kia\\"","suggestion":"Đề xuất ngắn tiếng Việt"},
  ...
]

QUY TẮC:
- conflictsWith: chuỗi ngắn, ưu tiên hiển thị "text gốc" của ràng buộc xung đột, kèm id nếu cần (ví dụ: 'hc_2: "9A không học thứ 7"').
- suggestion: tiếng Việt, ngắn gọn, ≤ 80 ký tự, hành động cụ thể.
- Nếu không xác định được ràng buộc gây xung đột, dùng conflictsWith="Ràng buộc nền (số slot/khả năng phân công)" và suggestion phù hợp.
- Trả ĐÚNG một entry cho mỗi violation, theo thứ tự input.`

export function buildCompilerUserMessage(payload: InputPayload, options?: CompilerMessageOptions): string {
  const teachers = [...new Set(payload.assignments.map(a => a.teacherLabel))]
  const subjects = [...new Set(payload.assignments.map(a => a.subjectLabel))]
  const classes = [...new Set(payload.assignments.map(a => a.classLabel))]
  const days = [...new Map(payload.slots.map(s => [s.dayId, { dayId: s.dayId, dayLabel: s.dayLabel }])).values()]
  const sessions = [...new Map(payload.slots.map(s => [s.sessionId, { sessionId: s.sessionId, sessionLabel: s.sessionLabel }])).values()]
  const periods = [...new Set(payload.slots.map(s => s.period))].sort((a, b) => a - b)

  if (options?.includeAllContext !== false || !options?.focusTexts || options.focusTexts.length === 0) {
    return JSON.stringify({
      hardConstraints: payload.hardConstraints,
      softConstraints: payload.softConstraints,
      context: { teachers, subjects, classes, days, sessions, periods },
    })
  }

  const focusSource = options.focusTexts.join('\n')
  const haystack = `${focusSource.toLocaleLowerCase('vi-VN')}\n${normalizeText(focusSource)}`

  const focusedTeachers = selectRelevantValues(teachers, haystack)
  const focusedSubjects = selectRelevantValues(subjects, haystack)
  const focusedClasses = selectRelevantValues(classes, haystack)
  const focusedDays = days.filter((d) => {
    const dayText = `${d.dayId} ${d.dayLabel}`
    const lower = dayText.toLocaleLowerCase('vi-VN')
    const normalized = normalizeText(dayText)
    return haystack.includes(lower) || haystack.includes(normalized)
  })
  const focusedSessions = sessions.filter((s) => {
    const sessionText = `${s.sessionId} ${s.sessionLabel}`
    const lower = sessionText.toLocaleLowerCase('vi-VN')
    const normalized = normalizeText(sessionText)
    return haystack.includes(lower) || haystack.includes(normalized)
  })

  return JSON.stringify({
    hardConstraints: payload.hardConstraints,
    softConstraints: payload.softConstraints,
    context: {
      teachers: focusedTeachers,
      subjects: focusedSubjects,
      classes: focusedClasses,
      days: focusedDays.length > 0 ? focusedDays : days,
      sessions: focusedSessions.length > 0 ? focusedSessions : sessions,
      periods,
    },
  })
}

export function estimateSolverConfig(payload: InputPayload): { maxTimeSeconds: number; numWorkers: number; randomSeed: number } {
  const slotCount = payload.slots.length
  const assignmentCount = payload.assignments.length
  const complexity = slotCount * assignmentCount

  // Heuristic tuned by dataset benchmark groups:
  // - small (<= 700): fewer workers to reduce process/search overhead
  // - medium (<= 2500): balanced
  // - large: more workers
  let numWorkers = 4
  if (complexity <= 700) numWorkers = 2
  else if (complexity <= 2500) numWorkers = 3

  let maxTimeSeconds = 15
  if (complexity > 1500) maxTimeSeconds = 25
  if (complexity > 3500) maxTimeSeconds = 40
  if (complexity > 7000) maxTimeSeconds = 55

  return {
    maxTimeSeconds,
    numWorkers,
    randomSeed: 1,
  }
}

export function toSolverProblem(
  payload: InputPayload,
  constraints: Array<{ id: string; code: string; priority: 'hard' | 'soft'; original?: string; checkerCode?: string }>,
): import('./sandbox').SolverProblem {
  return {
    slots: payload.slots.map(s => ({
      slotId: s.id,
      dayId: s.dayId,
      dayLabel: s.dayLabel,
      sessionId: s.sessionId,
      sessionLabel: s.sessionLabel,
      period: s.period,
    })),
    assignments: payload.assignments.map(a => ({
      assignmentId: a.id,
      teacherId: a.teacherId,
      teacherLabel: a.teacherLabel,
      classId: a.classId,
      classLabel: a.classLabel,
      subjectId: a.subjectId,
      subjectLabel: a.subjectLabel,
      weeklyPeriods: a.weeklyPeriods,
    })),
    aiCompiledConstraints: constraints.map(c => ({
      id: c.id,
      code: c.code,
      priority: c.priority,
      original: c.original ?? '',
      checkerCode: c.checkerCode ?? '',
    })),
    solverConfig: estimateSolverConfig(payload),
  }
}
