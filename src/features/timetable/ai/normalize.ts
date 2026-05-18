import { buildTimetablePayload } from './prompt'

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

  // Build unique teacher/subject/class IDs using index to avoid collisions
  // when multiple teachers share the same name
  const teacherLabelToId = new Map<string, string>()
  const subjectLabelToId = new Map<string, string>()
  const classLabelToId = new Map<string, string>()

  const assignments = payload.phan_cong_chuyen_mon.map((assignment: any, index: number) => {
    const teacherLabel = assignment.giao_vien
    const subjectLabel = assignment.mon_hoc
    const classLabel = assignment.lop

    // Assign unique IDs: first occurrence gets simple label, subsequent get indexed
    if (!teacherLabelToId.has(teacherLabel)) {
      teacherLabelToId.set(teacherLabel, `T${teacherLabelToId.size + 1}`)
    }
    if (!subjectLabelToId.has(subjectLabel)) {
      subjectLabelToId.set(subjectLabel, `S${subjectLabelToId.size + 1}`)
    }
    if (!classLabelToId.has(classLabel)) {
      classLabelToId.set(classLabel, `C${classLabelToId.size + 1}`)
    }

    return {
      assignmentId: `${assignment.giao_vien}__${assignment.mon_hoc}__${assignment.lop}__${assignment.so_tiet_moi_tuan}__${index}`,
      teacherId: teacherLabelToId.get(teacherLabel)!,
      teacherLabel,
      subjectId: subjectLabelToId.get(subjectLabel)!,
      subjectLabel,
      classId: classLabelToId.get(classLabel)!,
      classLabel,
      weeklyPeriods: Number(assignment.so_tiet_moi_tuan),
    }
  })

  const rawConstraints = payload.rang_buoc_xep_lich.map((constraint: any, index: number) => ({
    id: `c${index + 1}`,
    priority: constraint.loai === 'Bắt buộc' ? 'required' : 'preferred',
    text: constraint.noi_dung,
  }))

  return {
    slots,
    assignments,
    aiCompiledConstraints: [] as any[],  // will be injected after AI compilation
    unparsedConstraints: [] as any[],
    rawConstraints,
    solverConfig: {
      maxTimeSeconds: 20,
      numWorkers: 8,
      randomSeed: 1,
    },
  }
}

/**
 * Extract entity lists from solver input for AI compiler prompts
 */
export function extractEntities(solverInput: ReturnType<typeof buildSolverInput>) {
  const unique = (items: string[]) => [...new Set(items)]
  const uniqueDayIds = unique(solverInput.slots.map((s: any) => s.dayId))
  const uniqueSessionIds = unique(solverInput.slots.map((s: any) => s.sessionId))

  return {
    teachers: unique(solverInput.assignments.map((a: any) => a.teacherLabel)),
    subjects: unique(solverInput.assignments.map((a: any) => a.subjectLabel)),
    classes: unique(solverInput.assignments.map((a: any) => a.classLabel)),
    dayIds: uniqueDayIds,
    sessionIds: uniqueSessionIds,
  }
}
