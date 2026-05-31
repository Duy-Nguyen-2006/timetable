import type { DeterministicValidationReport } from './ai/constraint-spec'
import type { AgentLifecyclePhase } from './ai/types'
import type { AgentProgressStep } from './types'

export const RESULT_NOT_FOUND_MESSAGE = 'Không tìm được thời khóa biểu hợp lệ.'
export const NO_ACTIVE_PERIOD_MESSAGE = 'Không còn ô tiết nào để xếp lịch. Vui lòng khôi phục ít nhất một ô tiết ở trang xem trước.'
export const MAX_CACHED_RUNS = 3
export const SOLVER_STATUS_LABELS: Record<string, string> = {
  optimal: 'Tối ưu',
  feasible: 'Khả thi',
  timeout_with_solution: 'Hết giờ có lịch',
}

export const STEP_ORDER = ['thinking', 'coding', 'running', 'checking', 'fixing'] as const
export const STEP_LABELS: Record<AgentProgressStep, string> = {
  thinking: 'Suy nghĩ',
  coding: 'Viết code',
  running: 'Chạy thử',
  checking: 'Kiểm tra',
  fixing: 'Sửa lỗi',
  idle: 'Idle',
}

export function toProgressStep(phase: AgentLifecyclePhase): AgentProgressStep {
  switch (phase) {
    case 'coding':
    case 'running':
    case 'checking':
    case 'fixing':
      return phase
    case 'translator':
    case 'planner':
    case 'thinking':
      return 'thinking'
    case 'idle':
      return 'idle'
    default:
      return 'thinking'
  }
}

export function buildReportRows(
  title: string,
  report: DeterministicValidationReport | null | undefined,
): string[][] {
  if (!report) return [[title, 'Không có dữ liệu']]

  const rows: string[][] = [
    [title, ''],
    ['Base constraint pass', report.baseConstraintPass ? 'Yes' : 'No'],
    ['Hard constraint pass', report.hardConstraintPass ? 'Yes' : 'No'],
    ['Soft constraint pass', report.softConstraintPass ? 'Yes' : 'No'],
    ['Unchecked constraints', report.uncheckedConstraintIds?.join(' | ') || 'None'],
  ]

  rows.push([])
  rows.push(['constraintId', 'kind', 'message', 'offending entries'])
  report.violations.forEach((check) => {
    rows.push([
      check.constraintId,
      check.kind,
      check.message,
      String(check.offendingEntries?.length ?? 0),
    ])
  })

  return rows
}
