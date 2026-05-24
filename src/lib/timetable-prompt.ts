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
  constraints: Array<{ type: 'required' | 'preferred'; text: string; weight?: number }>
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

  const builtAssignments: InputPayload['assignments'] = assignments.map((assignment, index) => {
    if (!teacherToId.has(assignment.teacher)) teacherToId.set(assignment.teacher, `T${teacherToId.size + 1}`)
    if (!subjectToId.has(assignment.subject)) subjectToId.set(assignment.subject, `S${subjectToId.size + 1}`)
    if (!classToId.has(assignment.className)) classToId.set(assignment.className, `C${classToId.size + 1}`)

    return {
      id: `asg_${index}`,
      teacherId: teacherToId.get(assignment.teacher)!,
      teacherLabel: assignment.teacher,
      classId: classToId.get(assignment.className)!,
      classLabel: assignment.className,
      subjectId: subjectToId.get(assignment.subject)!,
      subjectLabel: assignment.subject,
      weeklyPeriods: Number(assignment.weeklyPeriods),
    }
  })

  const hardConstraints: InputPayload['hardConstraints'] = []
  const softConstraints: InputPayload['softConstraints'] = []

  constraints.forEach((constraint, index) => {
    if (constraint.type === 'required') {
      hardConstraints.push({ id: `hc_${index + 1}`, text: constraint.text })
    } else {
      softConstraints.push({ id: `sc_${index + 1}`, text: constraint.text, weight: constraint.weight ?? 5 })
    }
  })

  return { slots, assignments: builtAssignments, hardConstraints, softConstraints }
}

export function estimateSolverConfig(payload: InputPayload): { maxTimeSeconds: number; numWorkers: number; randomSeed: number } {
  const complexity = payload.slots.length * payload.assignments.length
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
