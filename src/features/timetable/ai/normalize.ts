import { buildTimetablePayload } from './prompt'
import type { ModelRequestPreview } from './types'

export function buildSolverInput(input: any) {
  const payload = buildTimetablePayload(input)

  const slots = payload.khung_thoi_khoa_bieu.flatMap((day: any) =>
    day.slots.map((slot: any) => ({
      slotId: slot.slotId,
      dayId: slot.dayId,
      dayLabel: slot.dayLabel,
      sessionId: slot.sessionId,
      sessionLabel: slot.sessionLabel,
      period: slot.period,
    })),
  )

  const assignments = payload.phan_cong_chuyen_mon.map((assignment: any, index: number) => ({
    assignmentId: `${assignment.giao_vien}__${assignment.mon_hoc}__${assignment.lop}__${assignment.so_tiet_moi_tuan}__${index}`,
    teacherId: assignment.giao_vien,
    teacherLabel: assignment.giao_vien,
    subjectId: assignment.mon_hoc,
    subjectLabel: assignment.mon_hoc,
    classId: assignment.lop,
    classLabel: assignment.lop,
    weeklyPeriods: Number(assignment.so_tiet_moi_tuan),
  }))

  const rawConstraints = payload.rang_buoc_xep_lich.map((constraint: any, index: number) => ({
    id: `constraint-${index + 1}`,
    priority: constraint.loai === 'Bắt buộc' ? 'required' : 'preferred',
    text: constraint.noi_dung,
  }))

  return {
    requestId: `req-${Date.now()}`,
    version: 'v1',
    slots,
    assignments,
    constraints: {
      hard: [],
      soft: [],
      rawText: rawConstraints,
    },
    solverConfig: {
      maxTimeSeconds: 20,
      numWorkers: 8,
      randomSeed: 1,
    },
  }
}

export function buildDevstralRequestPreview(input: any): ModelRequestPreview {
  const solverInput = buildSolverInput(input)
  const unique = (items: string[]) => [...new Set(items)]

  return {
    model: 'devstral-latest',
    temperature: 0,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'timetable_constraint_parse',
        schema: {
          type: 'object',
          properties: {
            hard: { type: 'array' },
            soft: { type: 'array' },
            unparsed: { type: 'array' },
          },
          required: ['hard', 'soft', 'unparsed'],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: 'system',
        content: 'Bạn là bộ phân tích ràng buộc thời khóa biểu. Chỉ trả JSON hợp lệ theo schema. Không giải bài toán, không sinh lịch, không thêm thực thể ngoài input.',
      },
      {
        role: 'user',
        content: {
          teachers: unique(solverInput.assignments.map((assignment: any) => assignment.teacherLabel)),
          subjects: unique(solverInput.assignments.map((assignment: any) => assignment.subjectLabel)),
          classes: unique(solverInput.assignments.map((assignment: any) => assignment.classLabel)),
          slots: solverInput.slots.map((slot: any) => ({
            slotId: slot.slotId,
            dayLabel: slot.dayLabel,
            sessionLabel: slot.sessionLabel,
            period: slot.period,
          })),
          constraints: solverInput.constraints.rawText,
          instructions: [
            'Chuẩn hóa constraint thành hard/soft.',
            'Nếu text tham chiếu đúng 1 teacher/class/subject/slot thì map vào id tương ứng.',
            'Nếu mơ hồ hoặc không map chắc chắn được, đưa vào unparsed và giải thích ngắn.',
          ],
        },
      },
    ],
  }
}
