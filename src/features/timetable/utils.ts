import { subjectPresets } from './constants'

const subjectAliases = new Map(subjectPresets.map((subject) => [subject.label.toLocaleLowerCase('vi'), subject.value]))

export const normalizeSubjectName = (name: string) => subjectAliases.get(name.trim().toLocaleLowerCase('vi')) ?? name.trim()

export const makeAssignmentKey = (teacher: string, subject: string, className: string, weeklyPeriods: string) =>
  `${teacher}__${subject}__${className}__${weeklyPeriods}`

export const sortAlphabetically = (items: string[]) =>
  [...items].sort((first, second) => first.localeCompare(second, 'vi', { numeric: true, sensitivity: 'base' }))

export const getCellKey = (dayId: string, sessionId: string, period: number) => `${dayId}-${sessionId}-${period}`

export const getAssignmentSlotKey = (teacher: string, className: string, slotId: string) => `${teacher}__${className}__${slotId}`

// Inlined from deleted solver-side lib (timetable-prompt.ts) — keeps payload normalization behavior identical for data entry
export type NormalizedAssignment = {
  id: string
  teacher: { id: string; label: string }
  subject: { id: string; label: string }
  class: { id: string; label: string }
  weeklyPeriods: number
}

export function normalizeAssignments(
  assignments: Array<{ teacher: string; subject: string; className: string; weeklyPeriods: string | number }>
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
