import type { GenerateTimetableRequest, NormalizedAssignment } from '@/features/timetable/ai/types'

export function normalizeAssignments(
  assignments: GenerateTimetableRequest['assignments'],
): NormalizedAssignment[] {
  const teacherToId = new Map<string, string>()
  const subjectToId = new Map<string, string>()
  const classToId = new Map<string, string>()

  return assignments.map((assignment, index) => {
    const teacherLabel = assignment.teacher.trim()
    const subjectLabel = assignment.subject.trim()
    const classLabel = assignment.className.trim()

    if (!teacherToId.has(teacherLabel)) teacherToId.set(teacherLabel, `T${teacherToId.size + 1}`)
    if (!subjectToId.has(subjectLabel)) subjectToId.set(subjectLabel, `S${subjectToId.size + 1}`)
    if (!classToId.has(classLabel)) classToId.set(classLabel, `C${classToId.size + 1}`)

    return {
      id: `asg_${index}`,
      teacher: {
        id: teacherToId.get(teacherLabel)!,
        label: teacherLabel,
      },
      subject: {
        id: subjectToId.get(subjectLabel)!,
        label: subjectLabel,
      },
      class: {
        id: classToId.get(classLabel)!,
        label: classLabel,
      },
      weeklyPeriods: Number(assignment.weeklyPeriods),
    }
  })
}

export function estimateSolverConfig(args: {
  days: Array<{ id: string; label: string }>
  sessions: Array<{ id: string; label: string }>
  periodCounts: Record<string, number>
  deletedPeriods: Record<string, boolean>
  assignments: Array<{ weeklyPeriods: number }>
}): { maxTimeSeconds: number; numWorkers: number; randomSeed: number } {
  const slotCount = args.days.reduce((daySum, day) => {
    const sessionCount = args.sessions.reduce((sessionSum, session) => {
      const count = args.periodCounts[session.id] ?? 0
      let activePeriods = 0
      for (let i = 0; i < count; i += 1) {
        const period = i + 1
        if (!args.deletedPeriods[`${day.id}-${session.id}-${period}`]) {
          activePeriods += 1
        }
      }
      return sessionSum + activePeriods
    }, 0)
    return daySum + sessionCount
  }, 0)

  const complexity = slotCount * args.assignments.length
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
