// Deterministic pre-checker for common Vietnamese timetable constraint patterns.
// Handles teacher/class × day/session/period block patterns without an LLM call.

import type { TimetableSolveCell } from '@/features/timetable/ai/types'

const DAY_NAMES: Record<string, string> = {
  '2': 'monday', 'hai': 'monday',
  '3': 'tuesday', 'ba': 'tuesday',
  '4': 'wednesday', 'tư': 'wednesday', 'tu': 'wednesday',
  '5': 'thursday', 'năm': 'thursday', 'nam': 'thursday',
  '6': 'friday', 'sáu': 'friday', 'sau': 'friday',
  '7': 'saturday', 'bảy': 'saturday', 'bay': 'saturday',
  'cn': 'sunday', 'nhật': 'sunday', 'nhat': 'sunday',
}

const SESSION_NAMES: Record<string, string> = {
  'sáng': 'morning', 'sang': 'morning',
  'chiều': 'afternoon', 'chieu': 'afternoon',
  'tối': 'night', 'toi': 'night',
}

type ParsedBlock =
  | { kind: 'teacher-day'; teacherLabel: string; dayId: string }
  | { kind: 'class-day'; classLabel: string; dayId: string }
  | { kind: 'teacher-session'; teacherLabel: string; sessionId: string }
  | { kind: 'class-session'; classLabel: string; sessionId: string }
  | { kind: 'teacher-period'; teacherLabel: string; period: number }
  | { kind: 'class-period'; classLabel: string; period: number }

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

function extractDay(text: string): string | null {
  const thuMatch = text.match(/thứ\s+([2-7]|hai|ba|tư|tu|năm|nam|sáu|sau|bảy|bay)/i)
  if (thuMatch) {
    const key = thuMatch[1].toLowerCase()
    return DAY_NAMES[key] ?? null
  }
  if (/chủ\s*nhật|chú\s*nhật|\bcn\b/i.test(text)) return 'sunday'
  return null
}

function extractSession(text: string): string | null {
  for (const [name, id] of Object.entries(SESSION_NAMES)) {
    if (text.includes(name)) return id
  }
  return null
}

function extractPeriod(text: string): number | null {
  const match = text.match(/tiết\s+(\d+)/i)
  if (match) {
    const n = parseInt(match[1], 10)
    return n > 0 ? n : null
  }
  return null
}

function findEntityLabel(text: string, labels: string[]): string | null {
  // Longest match first to avoid partial overlaps
  const sorted = [...labels].filter(Boolean).sort((a, b) => b.length - a.length)
  for (const label of sorted) {
    if (text.includes(label)) return label
  }
  return null
}

function parseConstraint(
  text: string,
  teacherLabels: string[],
  classLabels: string[],
): ParsedBlock | null {
  const lower = text.toLowerCase()

  if (lower.includes('không dạy') || lower.includes('khong day')) {
    const teacher = findEntityLabel(text, teacherLabels)
    if (!teacher) return null
    const day = extractDay(lower)
    if (day) return { kind: 'teacher-day', teacherLabel: teacher, dayId: day }
    const session = extractSession(lower)
    if (session) return { kind: 'teacher-session', teacherLabel: teacher, sessionId: session }
    const period = extractPeriod(lower)
    if (period !== null) return { kind: 'teacher-period', teacherLabel: teacher, period }
    return null
  }

  if (lower.includes('không học') || lower.includes('khong hoc')) {
    const cls = findEntityLabel(text, classLabels)
    if (!cls) return null
    const day = extractDay(lower)
    if (day) return { kind: 'class-day', classLabel: cls, dayId: day }
    const session = extractSession(lower)
    if (session) return { kind: 'class-session', classLabel: cls, sessionId: session }
    const period = extractPeriod(lower)
    if (period !== null) return { kind: 'class-period', classLabel: cls, period }
    return null
  }

  return null
}

function checkBlock(parsed: ParsedBlock, cells: TimetableSolveCell[]): string | null {
  for (const cell of cells) {
    for (const entry of cell.entries ?? []) {
      switch (parsed.kind) {
        case 'teacher-day':
          if (entry.teacher === parsed.teacherLabel && cell.dayId === parsed.dayId)
            return cell.slotId
          break
        case 'class-day':
          if (entry.className === parsed.classLabel && cell.dayId === parsed.dayId)
            return cell.slotId
          break
        case 'teacher-session':
          if (entry.teacher === parsed.teacherLabel && cell.sessionId === parsed.sessionId)
            return cell.slotId
          break
        case 'class-session':
          if (entry.className === parsed.classLabel && cell.sessionId === parsed.sessionId)
            return cell.slotId
          break
        case 'teacher-period':
          if (entry.teacher === parsed.teacherLabel && cell.period === parsed.period)
            return cell.slotId
          break
        case 'class-period':
          if (entry.className === parsed.classLabel && cell.period === parsed.period)
            return cell.slotId
          break
      }
    }
  }
  return null
}

function buildRepair(parsed: ParsedBlock, slot: string): string {
  switch (parsed.kind) {
    case 'teacher-day':
      return `Forbid tất cả slot dayId="${parsed.dayId}" cho giáo viên "${parsed.teacherLabel}" (x[asg, slot] = 0). Vi phạm: ${slot}`
    case 'class-day':
      return `Forbid tất cả slot dayId="${parsed.dayId}" cho lớp "${parsed.classLabel}". Vi phạm: ${slot}`
    case 'teacher-session':
      return `Forbid tất cả slot sessionId="${parsed.sessionId}" cho giáo viên "${parsed.teacherLabel}". Vi phạm: ${slot}`
    case 'class-session':
      return `Forbid tất cả slot sessionId="${parsed.sessionId}" cho lớp "${parsed.classLabel}". Vi phạm: ${slot}`
    case 'teacher-period':
      return `Forbid tất cả slot period=${parsed.period} cho giáo viên "${parsed.teacherLabel}". Vi phạm: ${slot}`
    case 'class-period':
      return `Forbid tất cả slot period=${parsed.period} cho lớp "${parsed.classLabel}". Vi phạm: ${slot}`
  }
}

export function runDeterministicChecks(
  hardConstraints: Array<{ id: string; text: string }>,
  assignments: Array<{ teacherLabel: string; classLabel: string }>,
  cells: TimetableSolveCell[],
): DeterministicCheckOutput {
  const teacherLabels = [...new Set(assignments.map((a) => a.teacherLabel))]
  const classLabels = [...new Set(assignments.map((a) => a.classLabel))]

  const violations: DetViolation[] = []
  const uncheckedIds: string[] = []

  for (const constraint of hardConstraints) {
    const parsed = parseConstraint(constraint.text, teacherLabels, classLabels)
    if (!parsed) {
      uncheckedIds.push(constraint.id)
      continue
    }
    const offendingSlot = checkBlock(parsed, cells)
    if (offendingSlot !== null) {
      violations.push({
        constraintId: constraint.id,
        original: constraint.text,
        evidence: `"${constraint.text}" vi phạm tại slot ${offendingSlot}`,
        repair: buildRepair(parsed, offendingSlot),
      })
    }
  }

  return { violations, uncheckedIds, allChecked: uncheckedIds.length === 0 }
}
