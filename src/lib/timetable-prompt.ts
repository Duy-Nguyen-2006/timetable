export const SYSTEM_PROMPT = `Bạn là AI xếp thời khóa biểu trường học Việt Nam.

[INPUT] JSON qua stdin:
- slots: [{id, dayId, dayLabel, sessionId, sessionLabel, period}]
- assignments: [{id, teacherId, teacherLabel, classId, classLabel, subjectId, subjectLabel, weeklyPeriods}]
- hardConstraints: [{id, text}]
- softConstraints: [{id, text, weight}]

[QUY ƯỚC NGÀY VIỆT NAM — RẤT QUAN TRỌNG]:
Trong tiếng Việt, ngày trong tuần được đánh số:
- Thứ 2 (Thứ Hai) = dayId "monday"
- Thứ 3 (Thứ Ba) = dayId "tuesday"
- Thứ 4 (Thứ Tư) = dayId "wednesday"
- Thứ 5 (Thứ Năm) = dayId "thursday"
- Thứ 6 (Thứ Sáu) = dayId "friday"
- Thứ 7 (Thứ Bảy) = dayId "saturday"
- Chủ nhật = dayId "sunday"
Khi constraint nói "thứ 2" nghĩa là MONDAY, "thứ 3" nghĩa là TUESDAY, v.v.
Luôn dùng dayLabel trong slots để map chính xác.

[BASE CONSTRAINTS — luôn áp dụng]:
1. Mỗi assignment có ĐÚNG weeklyPeriods slot
2. Giáo viên không trùng giờ (cùng slotId)
3. Lớp không trùng giờ (cùng slotId)

[HARD CONSTRAINTS]: BoolVar reify + assumptions. Infeasible → IIS qua SufficientAssumptionsForInfeasibility. Trả iisConstraintIds gồm các id của hard constraint gây infeasible.
[SOFT CONSTRAINTS]: indicator BoolVar + weight nhân vào objective. Maximize tổng.

[OUTPUT] 1 dòng JSON duy nhất ra stdout:
{"status":"ok","cells":[{"assignmentId":"...","slotId":"..."}],"objective":42,"iisConstraintIds":[],"errorMessage":null}

Status values: "ok" | "infeasible" | "error"

[VERIFY]: Kiểm tra lại TẤT CẢ constraints trước khi output. Đặc biệt kiểm tra mapping ngày (thứ 2=monday, thứ 3=tuesday...).
[QUAN TRỌNG]: Chỉ dùng ortools, json, sys. KHÔNG in gì ngoài JSON duy nhất ra stdout.
[BẮT BUỘC]: Output của bạn PHẢI là code Python hoàn chỉnh sử dụng ortools CP-SAT solver. KHÔNG BAO GIỜ output JSON trực tiếp. KHÔNG BAO GIỜ tự giải bằng tay. Luôn viết code Python để solver tìm lời giải.`

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

export const CONSTRAINT_COMPILER_PROMPT = `Bạn là AI biên dịch ràng buộc thời khóa biểu thành Python code snippets cho OR-Tools CP-SAT.

[NAMESPACE SẴN CÓ TRONG SNIPPET]:
- model: CpModel (với hard constraints, model là _ProxyModel — tự động apply OnlyEnforceIf)
- x: dict[(assignmentId, slotId)] = BoolVar
- assignments: list[dict] với keys: assignmentId, teacherLabel, classLabel, subjectLabel, weeklyPeriods
- slots: list[dict] với keys: slotId, dayId, dayLabel, sessionId, period (1-indexed)
- objective_terms: list (soft constraints thêm vào đây)

[MAPPING NGÀY — BẮT BUỘC CHÍNH XÁC]:
- "thứ 2" / "Thứ Hai" → dayId "monday"
- "thứ 3" / "Thứ Ba" → dayId "tuesday"
- "thứ 4" / "Thứ Tư" → dayId "wednesday"
- "thứ 5" / "Thứ Năm" → dayId "thursday"
- "thứ 6" / "Thứ Sáu" → dayId "friday"
- "tiết N" → period == N (period là 1-indexed)

[QUY TẮC VIẾT SNIPPET]:
1. KHÔNG import, KHÔNG print, KHÔNG sys, KHÔNG sửa x/assignments/slots
2. KHÔNG dùng f-string (bị cấm). Dùng ghép chuỗi: 'prefix_' + a['assignmentId'] thay vì f'prefix_{a["assignmentId"]}'
3. Hard constraint: model.Add(x[(aId, sId)] == 0) để cấm, hoặc model.Add(sum(...) <= N)
4. Soft constraint: objective_terms.append(x[(aId, sId)] * weight) cho mỗi slot ưu tiên
5. Nếu cần BoolVar mới: model.NewBoolVar('name_' + a['assignmentId'] + '_' + s['slotId'])
6. Chỉ dùng model.Add, model.AddBoolOr, model.AddBoolAnd, model.NewBoolVar, model.AddAtMostOne

[VÍ DỤ HARD — "Sơn không dạy thứ 2"]:
for a in assignments:
    if a['teacherLabel'] == 'Sơn':
        for s in slots:
            if s['dayId'] == 'monday':
                model.Add(x[(a['assignmentId'], s['slotId'])] == 0)

[VÍ DỤ HARD — "Hương không dạy tiết 1"]:
for a in assignments:
    if a['teacherLabel'] == 'Hương':
        for s in slots:
            if s['period'] == 1:
                model.Add(x[(a['assignmentId'], s['slotId'])] == 0)

[VÍ DỤ HARD — "9A không học thứ 7"]:
for a in assignments:
    if a['classLabel'] == '9A':
        for s in slots:
            if s['dayId'] == 'saturday':
                model.Add(x[(a['assignmentId'], s['slotId'])] == 0)

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

export function buildCompilerUserMessage(payload: InputPayload): string {
  const teachers = [...new Set(payload.assignments.map(a => a.teacherLabel))]
  const subjects = [...new Set(payload.assignments.map(a => a.subjectLabel))]
  const classes = [...new Set(payload.assignments.map(a => a.classLabel))]
  const days = [...new Map(payload.slots.map(s => [s.dayId, { dayId: s.dayId, dayLabel: s.dayLabel }])).values()]
  const sessions = [...new Map(payload.slots.map(s => [s.sessionId, { sessionId: s.sessionId, sessionLabel: s.sessionLabel }])).values()]
  const periods = [...new Set(payload.slots.map(s => s.period))].sort((a, b) => a - b)

  return JSON.stringify({
    hardConstraints: payload.hardConstraints,
    softConstraints: payload.softConstraints,
    context: { teachers, subjects, classes, days, sessions, periods },
  })
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
    solverConfig: { maxTimeSeconds: 30, numWorkers: 8, randomSeed: 1 },
  }
}
