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
