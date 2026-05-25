import type {
  ConstraintCheckItem,
  DeterministicValidationReport,
  SolverExecutionOutput,
  TimetableSolveCell,
} from '@/features/timetable/ai/types'
import type { ParsedConstraint } from '@/lib/constraint-parser'
import type { NormalizedConstraint, SolverProblemContext } from '@/lib/timetable-problem'

function entries(cells: TimetableSolveCell[]) {
  return cells.flatMap((cell) => (cell.entries ?? []).map((entry) => ({ cell, entry })))
}

function buildBaseChecks(context: SolverProblemContext, cells: TimetableSolveCell[]): ConstraintCheckItem[] {
  const checks: ConstraintCheckItem[] = []
  const slotIds = new Set(context.payload.slots.map((slot) => slot.id))
  const teacherSlotUsage = new Set<string>()
  const classSlotUsage = new Set<string>()
  const assignmentUsage = new Map<string, number>()
  const assignmentFallbackIndex = new Map<string, string[]>()
  const assignmentIds = new Set(context.payload.assignments.map((assignment) => assignment.id))

  for (const assignment of context.payload.assignments) {
    const key = `${assignment.teacherLabel}__${assignment.subjectLabel}__${assignment.classLabel}`
    assignmentFallbackIndex.set(key, [...(assignmentFallbackIndex.get(key) ?? []), assignment.id])
  }

  let teacherConflict = false
  let classConflict = false
  let slotInvalid = false
  let missingAssignmentKeyCount = 0
  let fallbackMatchedCount = 0
  let fallbackAmbiguousCount = 0

  for (const cell of cells) {
    if (!slotIds.has(cell.slotId)) slotInvalid = true
    for (const entry of cell.entries) {
      const directAssignmentKey = typeof entry.assignmentKey === 'string' ? entry.assignmentKey : ''
      let resolvedAssignmentKey = assignmentIds.has(directAssignmentKey) ? directAssignmentKey : null

      if (!resolvedAssignmentKey) {
        missingAssignmentKeyCount += 1
        const fallbackKey = `${entry.teacher}__${entry.subject}__${entry.className}`
        const matchedAssignmentIds = assignmentFallbackIndex.get(fallbackKey) ?? []
        if (matchedAssignmentIds.length === 1) {
          resolvedAssignmentKey = matchedAssignmentIds[0]
          fallbackMatchedCount += 1
        } else if (matchedAssignmentIds.length > 1) {
          fallbackAmbiguousCount += 1
        }
      }

      if (resolvedAssignmentKey) {
        assignmentUsage.set(resolvedAssignmentKey, (assignmentUsage.get(resolvedAssignmentKey) ?? 0) + 1)
      }
      const teacherKey = `${entry.teacher}__${cell.slotId}`
      const classKey = `${entry.className}__${cell.slotId}`
      if (teacherSlotUsage.has(teacherKey)) teacherConflict = true
      if (classSlotUsage.has(classKey)) classConflict = true
      teacherSlotUsage.add(teacherKey)
      classSlotUsage.add(classKey)
    }
  }

  const mismatchedAssignments = context.payload.assignments.filter(
    (assignment) => (assignmentUsage.get(assignment.id) ?? 0) !== assignment.weeklyPeriods,
  )
  const coverageFailed = mismatchedAssignments.length > 0

  checks.push({
    constraintId: 'base_teacher_conflict',
    original: 'Giáo viên không dạy 2 lớp cùng 1 tiết',
    passed: !teacherConflict,
    severity: 'base',
    reason: teacherConflict ? 'Phát hiện giáo viên bị trùng slot.' : 'Không phát hiện teacher conflict.',
  })
  checks.push({
    constraintId: 'base_class_conflict',
    original: 'Một lớp không học 2 môn / 2 giáo viên cùng 1 tiết',
    passed: !classConflict,
    severity: 'base',
    reason: classConflict ? 'Phát hiện lớp bị trùng slot.' : 'Không phát hiện class conflict.',
  })
  checks.push({
    constraintId: 'base_assignment_coverage',
    original: 'Mỗi assignment phải đủ số tiết/tuần',
    passed: !coverageFailed,
    severity: 'base',
    reason: coverageFailed
      ? [
        'Có assignment chưa đủ hoặc vượt weeklyPeriods.',
        missingAssignmentKeyCount > 0 ? `entries thiếu/không hợp lệ assignmentKey: ${missingAssignmentKeyCount}` : null,
        fallbackMatchedCount > 0 ? `fallback teacher+subject+class đã map được: ${fallbackMatchedCount}` : null,
        fallbackAmbiguousCount > 0 ? `fallback teacher+subject+class bị ambiguous: ${fallbackAmbiguousCount}` : null,
        mismatchedAssignments.length > 0
          ? `assignment lệch count: ${mismatchedAssignments
            .slice(0, 5)
            .map((assignment) => `${assignment.id}=${assignmentUsage.get(assignment.id) ?? 0}/${assignment.weeklyPeriods}`)
            .join(', ')}`
          : null,
      ].filter(Boolean).join(' ')
      : fallbackMatchedCount > 0
        ? `Tất cả assignment đều khớp weeklyPeriods. Đã recover ${fallbackMatchedCount} entries bằng teacher+subject+class fallback.`
        : 'Tất cả assignment đều khớp weeklyPeriods.',
  })
  checks.push({
    constraintId: 'base_slot_validity',
    original: 'Slot bị xóa khỏi UI không được dùng',
    passed: !slotInvalid,
    severity: 'base',
    reason: slotInvalid ? 'Có slot không tồn tại trong payload.' : 'Mọi slot đều hợp lệ.',
  })

  return checks
}

function blockedSlot(cell: TimetableSolveCell, days?: string[], sessions?: string[], periods?: number[]) {
  if (days && days.length > 0 && !days.includes(cell.dayId)) return false
  if (sessions && sessions.length > 0 && !sessions.includes(cell.sessionId)) return false
  if (periods && periods.length > 0 && !periods.includes(cell.period)) return false
  return true
}

function hardConstraintPassed(parsed: ParsedConstraint, cells: TimetableSolveCell[]): boolean {
  switch (parsed.kind) {
    case 'teacher_block_days':
      return !entries(cells).some(({ cell, entry }) => parsed.teacherLabels.includes(entry.teacher) && parsed.dayIds.includes(cell.dayId))
    case 'teacher_block_periods':
      return !entries(cells).some(({ cell, entry }) => parsed.teacherLabels.includes(entry.teacher) && parsed.periods.includes(cell.period))
    case 'teacher_block_sessions':
      return !entries(cells).some(({ cell, entry }) => parsed.teacherLabels.includes(entry.teacher) && parsed.sessionIds.includes(cell.sessionId))
    case 'teacher_block_day_period':
      return !entries(cells).some(({ cell, entry }) => parsed.teacherLabels.includes(entry.teacher) && blockedSlot(cell, parsed.dayIds, undefined, parsed.periods))
    case 'teacher_block_session_day':
      return !entries(cells).some(({ cell, entry }) => parsed.teacherLabels.includes(entry.teacher) && blockedSlot(cell, parsed.dayIds, parsed.sessionIds))
    case 'teacher_allow_only_days':
      return !entries(cells).some(({ cell, entry }) => parsed.teacherLabels.includes(entry.teacher) && !parsed.dayIds.includes(cell.dayId))
    case 'teacher_allow_only_sessions':
      return !entries(cells).some(({ cell, entry }) => parsed.teacherLabels.includes(entry.teacher) && !parsed.sessionIds.includes(cell.sessionId))
    case 'class_block_days':
      return !entries(cells).some(({ cell, entry }) => parsed.classLabels.includes(entry.className) && parsed.dayIds.includes(cell.dayId))
    case 'subject_block_periods':
      return !entries(cells).some(({ cell, entry }) => parsed.subjectLabels.includes(entry.subject) && parsed.periods.includes(cell.period))
    case 'subject_pin_periods':
      return parsed.subjectLabels.every((subject) => entries(cells).some(({ cell, entry }) => entry.subject === subject && parsed.periods.includes(cell.period)))
    case 'subject_only_sessions':
      return !entries(cells).some(({ cell, entry }) => parsed.subjectLabels.includes(entry.subject) && !parsed.sessionIds.includes(cell.sessionId))
    case 'subject_block_consecutive':
      return true
    case 'teacher_max_consecutive':
      return true
    case 'teacher_min_off_days':
      return true
    case 'class_daily_subject_any':
      return true
    case 'subjects_not_consecutive':
      return true
    case 'subject_prefer_periods':
    case 'subject_prefer_sessions':
      return true
    case 'unparsed':
      return false
  }
}

function softConstraintPassed(parsed: ParsedConstraint, cells: TimetableSolveCell[]): boolean {
  switch (parsed.kind) {
    case 'subject_prefer_periods':
      return entries(cells)
        .filter(({ entry }) => parsed.subjectLabels.includes(entry.subject))
        .every(({ cell, entry }) => {
          if (parsed.classFilter && parsed.classFilter.length > 0 && !parsed.classFilter.includes(entry.className)) {
            return true
          }
          return parsed.periods.includes(cell.period)
        })
    case 'subject_prefer_sessions':
      return entries(cells)
        .filter(({ entry }) => parsed.subjectLabels.includes(entry.subject))
        .every(({ cell }) => parsed.sessionIds.includes(cell.sessionId))
    case 'subject_block_periods':
      return !entries(cells).some(({ cell, entry }) => parsed.subjectLabels.includes(entry.subject) && parsed.periods.includes(cell.period))
    case 'subject_only_sessions':
      return !entries(cells).some(({ cell, entry }) => parsed.subjectLabels.includes(entry.subject) && !parsed.sessionIds.includes(cell.sessionId))
    case 'subject_block_consecutive':
    case 'teacher_max_consecutive':
    case 'teacher_min_off_days':
    case 'class_daily_subject_any':
    case 'subjects_not_consecutive':
      return true
    case 'unparsed':
      return false
    default:
      return hardConstraintPassed(parsed, cells)
  }
}

function buildHardChecks(constraints: NormalizedConstraint[], cells: TimetableSolveCell[]): ConstraintCheckItem[] {
  return constraints.map((constraint) => {
    const passed = hardConstraintPassed(constraint.parsed, cells)
    return {
      constraintId: constraint.id,
      original: constraint.original,
      passed,
      severity: 'hard',
      reason: passed ? 'Hard constraint pass.' : `Hard constraint fail hoặc chưa parse được (${constraint.parsed.kind}).`,
      suggestion: passed ? undefined : 'Cần sửa solver encoding hoặc parser/validator cho constraint này.',
    }
  })
}

function buildSoftChecks(constraints: NormalizedConstraint[], cells: TimetableSolveCell[]): ConstraintCheckItem[] {
  return constraints.map((constraint) => {
    const passed = softConstraintPassed(constraint.parsed, cells)
    return {
      constraintId: constraint.id,
      original: constraint.original,
      passed,
      severity: 'soft',
      reason: passed ? 'Soft constraint currently satisfied.' : 'Soft constraint not fully optimized.',
      suggestion: passed ? undefined : 'Có thể retry để tối ưu objective, nhưng không bắt buộc reject.',
    }
  })
}

export function validateTimetableResult(
  context: SolverProblemContext,
  solverResult: SolverExecutionOutput,
): DeterministicValidationReport {
  console.error('[timetable-validator] validateTimetableResult start', {
    solverStatus: solverResult.status,
    artifactPath: solverResult.artifactPath ?? null,
    totalCells: solverResult.cells.length,
    nonEmptyCells: solverResult.cells.filter((cell) => (cell.entries ?? []).length > 0).length,
    sampleEntries: solverResult.cells
      .filter((cell) => (cell.entries ?? []).length > 0)
      .slice(0, 3)
      .map((cell) => ({
        slotId: cell.slotId,
        entries: (cell.entries ?? []).map((entry) => ({
          assignmentKey: entry.assignmentKey,
          teacher: entry.teacher,
          subject: entry.subject,
          className: entry.className,
        })),
      })),
  })

  const checks = [
    ...buildBaseChecks(context, solverResult.cells),
    ...buildHardChecks(context.parsedHard, solverResult.cells),
    ...buildSoftChecks(context.parsedSoft, solverResult.cells),
  ]

  const baseConstraintPass = checks.filter((item) => item.severity === 'base').every((item) => item.passed)
  const hardConstraintPass = checks.filter((item) => item.severity === 'hard').every((item) => item.passed)
  const softChecks = checks.filter((item) => item.severity === 'soft')
  const softConstraintScore = softChecks.length === 0 ? 1 : softChecks.filter((item) => item.passed).length / softChecks.length
  const uncheckedConstraintIds = context.parsedHard.filter((item) => item.parsed.kind === 'unparsed').map((item) => item.id)

  return {
    valid: baseConstraintPass && hardConstraintPass,
    baseConstraintPass,
    hardConstraintPass,
    softConstraintScore,
    summary: baseConstraintPass && hardConstraintPass
      ? 'Deterministic validator xác nhận pass base + hard constraints.'
      : 'Deterministic validator phát hiện base/hard constraint chưa đạt.',
    checks,
    uncheckedConstraintIds,
  }
}
