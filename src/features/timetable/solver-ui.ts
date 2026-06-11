import type { AIProviderConfig, SolverProfile } from './ai/types'
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

/** Deterministic solve path: chuẩn bị → xếp lịch → kiểm tra */
export const STEP_ORDER = ['preparing', 'running', 'checking'] as const
export const STEP_LABELS: Record<AgentProgressStep, string> = {
  preparing: 'Chuẩn bị',
  running: 'Xếp lịch',
  checking: 'Kiểm tra',
  idle: 'Sẵn sàng',
}

export const SOLVER_PROFILE_LABELS: Record<SolverProfile, string> = {
  fast: 'Nhanh',
  balanced: 'Cân bằng',
  deep: 'Sâu',
}

export const DEFAULT_SOLVER_CONFIG: AIProviderConfig = {
  baseURL: '',
  apiKey: '',
  model: 'deterministic-solver',
  solverProfile: 'balanced',
  solverRuntimeMode: 'bundled',
}

export function resolveSolveConfig(aiProvider: AIProviderConfig | null): AIProviderConfig {
  if (!aiProvider) return DEFAULT_SOLVER_CONFIG
  return {
    ...DEFAULT_SOLVER_CONFIG,
    ...aiProvider,
    solverProfile: aiProvider.solverProfile ?? DEFAULT_SOLVER_CONFIG.solverProfile,
    solverRuntimeMode: aiProvider.solverRuntimeMode ?? DEFAULT_SOLVER_CONFIG.solverRuntimeMode,
  }
}

export function toProgressStep(phase: AgentLifecyclePhase): AgentProgressStep {
  switch (phase) {
    case 'running':
    case 'coding':
      return 'running'
    case 'checking':
    case 'fixing':
      return 'checking'
    case 'translator':
    case 'planner':
    case 'thinking':
    case 'idle':
      return 'preparing'
    default:
      return 'preparing'
  }
}

export function solveProgressPercent(step: AgentProgressStep): number {
  switch (step) {
    case 'preparing':
      return 20
    case 'running':
      return 65
    case 'checking':
      return 90
    case 'idle':
      return 100
    default:
      return 5
  }
}

export function buildReportRows(
  title: string,
  report: DeterministicValidationReport | null | undefined,
): string[][] {
  if (!report) return [[title, 'Không có dữ liệu']]

  const rows: string[][] = [
    [title, ''],
    ['Luật nền', report.baseConstraintPass ? 'Đạt' : 'Không đạt'],
    ['Ràng buộc bắt buộc', report.hardConstraintPass ? 'Đạt' : 'Không đạt'],
    ['Ràng buộc nên có', report.softConstraintPass ? 'Đạt' : 'Không đạt'],
    ['Chưa kiểm tra được', report.uncheckedConstraintIds?.join(' | ') || 'Không có'],
  ]

  rows.push([])
  rows.push(['Mã ràng buộc', 'Loại', 'Thông báo', 'Số ô liên quan'])
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