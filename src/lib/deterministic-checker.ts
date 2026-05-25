import type { TimetableSolveCell } from '@/features/timetable/ai/types'
import type { ParsedConstraint } from '@/lib/constraint-parser'

export type DetViolation = {
  constraintId: string
  original: string
  evidence: string
  repair: string
}

export type DeterministicCheckOutput = {
  violations: DetViolation[]
  uncheckedIds: string[]
  allChecked: boolean
}

type ParsedInput = { id: string; original: string; parsed: ParsedConstraint }
type Assignment = { teacherLabel: string; classLabel: string; subjectLabel: string }

function entries(cells: TimetableSolveCell[]) {
  return cells.flatMap((cell) => (cell.entries ?? []).map((entry) => ({ cell, entry })))
}

function blockedSlot(cell: TimetableSolveCell, days?: string[], sessions?: string[], periods?: number[]) {
  if (days && days.length > 0 && !days.includes(cell.dayId)) return false
  if (sessions && sessions.length > 0 && !sessions.includes(cell.sessionId)) return false
  if (periods && periods.length > 0 && !periods.includes(cell.period)) return false
  return true
}

function labelsOf(assignments: Assignment[], key: keyof Assignment): string[] {
  return [...new Set(assignments.map((assignment) => assignment[key]).filter(Boolean))]
}

function resolveLabels<T extends string>(labels: T[] | '*', all: T[]): T[] {
  return labels === '*' ? all : labels
}

function violation(message: string): string {
  return message
}

export function checkParsed(
  parsed: ParsedConstraint,
  cells: TimetableSolveCell[],
  assignments: Assignment[],
): string | null {
  const allTeachers = labelsOf(assignments, 'teacherLabel')
  const allClasses = labelsOf(assignments, 'classLabel')
  const allDays = [...new Set(cells.map((cell) => cell.dayId))]

  switch (parsed.kind) {
    case 'teacher_block_days':
      return checkTeacherBlock(parsed.teacherLabels, cells, parsed.dayIds)
    case 'teacher_block_periods':
      return checkTeacherBlock(parsed.teacherLabels, cells, undefined, undefined, parsed.periods)
    case 'teacher_block_sessions':
      return checkTeacherBlock(parsed.teacherLabels, cells, undefined, parsed.sessionIds)
    case 'teacher_block_day_period':
      return checkTeacherBlock(parsed.teacherLabels, cells, parsed.dayIds, undefined, parsed.periods)
    case 'teacher_block_session_day':
      return checkTeacherBlock(parsed.teacherLabels, cells, parsed.dayIds, parsed.sessionIds)
    case 'teacher_allow_only_days':
      return checkTeacherAllow(parsed.teacherLabels, cells, (cell) => parsed.dayIds.includes(cell.dayId), 'ngày cho phép')
    case 'teacher_allow_only_sessions':
      return checkTeacherAllow(parsed.teacherLabels, cells, (cell) => parsed.sessionIds.includes(cell.sessionId), 'buổi cho phép')
    case 'class_block_days':
      for (const { cell, entry } of entries(cells)) {
        if (parsed.classLabels.includes(entry.className) && parsed.dayIds.includes(cell.dayId)) {
          return violation(`Lớp ${entry.className} xuất hiện ở ${cell.slotId}.`)
        }
      }
      return null
    case 'subject_block_periods':
      for (const { cell, entry } of entries(cells)) {
        if (parsed.subjectLabels.includes(entry.subject) && parsed.periods.includes(cell.period)) {
          return violation(`${entry.subject} xuất hiện ở tiết ${cell.period} (${cell.slotId}).`)
        }
      }
      return null
    case 'subject_pin_periods':
      for (const subject of parsed.subjectLabels) {
        const classes = new Set(entries(cells).filter(({ entry }) => entry.subject === subject).map(({ entry }) => entry.className))
        for (const className of classes) {
          const ok = entries(cells).some(({ cell, entry }) => (
            entry.subject === subject && entry.className === className && parsed.periods.includes(cell.period)
          ))
          if (!ok) return violation(`${subject} của lớp ${className} không có tiết nào ở period bắt buộc.`)
        }
      }
      return null
    case 'subject_only_sessions':
      for (const { cell, entry } of entries(cells)) {
        if (parsed.subjectLabels.includes(entry.subject) && !parsed.sessionIds.includes(cell.sessionId)) {
          return violation(`${entry.subject} bị xếp ngoài buổi cho phép tại ${cell.slotId}.`)
        }
      }
      return null
    case 'subject_block_consecutive':
      return checkSubjectBlockConsecutive(parsed.subjectLabels, parsed.blockSize, cells)
    case 'teacher_max_consecutive':
      return checkTeacherMaxConsecutive(resolveLabels(parsed.teacherLabels, allTeachers), parsed.max, cells)
    case 'teacher_min_off_days':
      return checkTeacherMinOffDays(resolveLabels(parsed.teacherLabels, allTeachers), parsed.min, allDays, cells)
    case 'class_daily_subject_any':
      return checkClassDailySubjectAny(resolveLabels(parsed.classLabels, allClasses), parsed.subjectLabels, allDays, cells)
    case 'subjects_not_consecutive':
      return checkSubjectsNotConsecutive(parsed.subjectLabels, cells)
    case 'subject_prefer_periods':
    case 'subject_prefer_sessions':
      return null
    case 'unparsed':
      return null
  }
}

function checkTeacherBlock(teacherLabels: string[], cells: TimetableSolveCell[], days?: string[], sessions?: string[], periods?: number[]) {
  for (const { cell, entry } of entries(cells)) {
    if (teacherLabels.includes(entry.teacher) && blockedSlot(cell, days, sessions, periods)) {
      return violation(`Giáo viên ${entry.teacher} xuất hiện ở slot bị chặn ${cell.slotId}.`)
    }
  }
  return null
}

function checkTeacherAllow(teacherLabels: string[], cells: TimetableSolveCell[], allowed: (cell: TimetableSolveCell) => boolean, label: string) {
  for (const { cell, entry } of entries(cells)) {
    if (teacherLabels.includes(entry.teacher) && !allowed(cell)) {
      return violation(`Giáo viên ${entry.teacher} xuất hiện ngoài ${label}: ${cell.slotId}.`)
    }
  }
  return null
}

function byClassDaySubject(cells: TimetableSolveCell[], subjectLabels: string[]) {
  const grouped = new Map<string, number[]>()
  for (const { cell, entry } of entries(cells)) {
    if (!subjectLabels.includes(entry.subject)) continue
    const key = `${entry.className}__${cell.dayId}__${entry.subject}`
    const periods = grouped.get(key) ?? []
    periods.push(cell.period)
    grouped.set(key, periods)
  }
  return grouped
}

function checkSubjectBlockConsecutive(subjectLabels: string[], blockSize: number, cells: TimetableSolveCell[]) {
  if (blockSize <= 1) return null
  for (const [key, periods] of byClassDaySubject(cells, subjectLabels)) {
    const sorted = [...new Set(periods)].sort((a, b) => a - b)
    for (const period of sorted) {
      let run = 1
      for (let next = period + 1; sorted.includes(next); next++) run += 1
      if (run >= blockSize) return null
    }
    if (sorted.length > 0) return violation(`${key} không có block ${blockSize} tiết liên tiếp.`)
  }
  return null
}

function checkTeacherMaxConsecutive(teacherLabels: string[], max: number, cells: TimetableSolveCell[]) {
  const grouped = new Map<string, number[]>()
  for (const { cell, entry } of entries(cells)) {
    if (!teacherLabels.includes(entry.teacher)) continue
    const key = `${entry.teacher}__${cell.dayId}`
    const periods = grouped.get(key) ?? []
    periods.push(cell.period)
    grouped.set(key, periods)
  }
  for (const [key, periods] of grouped) {
    const sorted = [...new Set(periods)].sort((a, b) => a - b)
    let run = 1
    for (let i = 1; i < sorted.length; i++) {
      run = sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1
      if (run > max) return violation(`${key} có hơn ${max} tiết liên tiếp.`)
    }
  }
  return null
}

function checkTeacherMinOffDays(teacherLabels: string[], min: number, allDays: string[], cells: TimetableSolveCell[]) {
  for (const teacher of teacherLabels) {
    const workingDays = new Set(entries(cells).filter(({ entry }) => entry.teacher === teacher).map(({ cell }) => cell.dayId))
    const offDays = allDays.filter((day) => !workingDays.has(day)).length
    if (offDays < min) return violation(`${teacher} chỉ có ${offDays} ngày nghỉ, cần tối thiểu ${min}.`)
  }
  return null
}

function checkClassDailySubjectAny(classLabels: string[], subjectLabels: string[], allDays: string[], cells: TimetableSolveCell[]) {
  for (const className of classLabels) {
    for (const day of allDays) {
      const ok = entries(cells).some(({ cell, entry }) => (
        entry.className === className && cell.dayId === day && subjectLabels.includes(entry.subject)
      ))
      if (!ok) return violation(`${className} thiếu ${subjectLabels.join('/')} trong ngày ${day}.`)
    }
  }
  return null
}

function checkSubjectsNotConsecutive(subjectLabels: string[], cells: TimetableSolveCell[]) {
  const occupied = new Map<string, Set<number>>()
  for (const { cell, entry } of entries(cells)) {
    if (!subjectLabels.includes(entry.subject)) continue
    const key = `${entry.className}__${cell.dayId}`
    const periods = occupied.get(key) ?? new Set<number>()
    periods.add(cell.period)
    occupied.set(key, periods)
  }
  for (const [key, periods] of occupied) {
    for (const period of periods) {
      if (periods.has(period + 1)) return violation(`${key} có subject bị cấm ở hai tiết liên tiếp ${period}-${period + 1}.`)
    }
  }
  return null
}

export function runDeterministicChecks(
  hardConstraints: ParsedInput[],
  assignments: Assignment[],
  cells: TimetableSolveCell[],
): DeterministicCheckOutput {
  const violations: DetViolation[] = []
  const uncheckedIds: string[] = []

  for (const constraint of hardConstraints) {
    if (constraint.parsed.kind === 'unparsed') {
      uncheckedIds.push(constraint.id)
      continue
    }
    const evidence = checkParsed(constraint.parsed, cells, assignments)
    if (evidence) {
      violations.push({
        constraintId: constraint.id,
        original: constraint.original,
        evidence,
        repair: `Sửa handler kind=${constraint.parsed.kind} để loại vi phạm: ${evidence}`,
      })
    }
  }

  return { violations, uncheckedIds, allChecked: uncheckedIds.length === 0 }
}
