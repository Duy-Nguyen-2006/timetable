import { subjectPresets } from './constants'

const subjectAliases = new Map(subjectPresets.map((subject) => [subject.label.toLocaleLowerCase('vi'), subject.value]))

export const normalizeSubjectName = (name: string) => subjectAliases.get(name.trim().toLocaleLowerCase('vi')) ?? name.trim()

export const makeAssignmentKey = (teacher: string, subject: string, className: string, weeklyPeriods: string) =>
  `${teacher}__${subject}__${className}__${weeklyPeriods}`

export const sortAlphabetically = (items: string[]) =>
  [...items].sort((first, second) => first.localeCompare(second, 'vi', { numeric: true, sensitivity: 'base' }))

export const getCellKey = (dayId: string, sessionId: string, period: number) => `${dayId}-${sessionId}-${period}`
