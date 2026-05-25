import { randomUUID } from 'node:crypto'

import type {
  AgentEvent,
  AttemptSummary,
  CheckerReport,
  ConstraintViolation,
  DeterministicValidationReport,
  SolveTelemetry,
  SolverExecutionOutput,
  SolverRequestPayload,
  TimetableSolveResult,
} from '@/features/timetable/ai/types'
import { buildSolverProblemContext } from '@/lib/timetable-problem'
import { validateTimetableResult } from '@/lib/timetable-validator'

const PI_RUNTIME_NOT_CONFIGURED_MESSAGE = 'Pi.dev runtime chưa được tích hợp trong codebase hiện tại.'

type ProgressEmitter = (event: AgentEvent) => void

type PiRuntimeDependencies = {
  execute?: (args: { payload: SolverRequestPayload; requestId: string; apiKey: string; model: string }) => Promise<SolverExecutionOutput>
}

function nowIso() {
  return new Date().toISOString()
}

function buildAttemptSummary(summary: string, status: AttemptSummary['status'], details?: string[]): AttemptSummary {
  return {
    attempt: 1,
    phase: 'system',
    status,
    summary,
    details,
    startedAt: nowIso(),
    finishedAt: nowIso(),
  }
}

function buildSoftViolations(report: DeterministicValidationReport): ConstraintViolation[] {
  return report.checks
    .filter((check) => check.severity === 'soft' && !check.passed)
    .map((check) => ({
      constraintId: check.constraintId,
      original: check.original,
      violated: false,
      reason: check.reason,
      confidence: 0.7,
      suggestion: check.suggestion,
    }))
}

function buildHardViolations(report: DeterministicValidationReport): ConstraintViolation[] {
  return report.checks
    .filter((check) => (check.severity === 'base' || check.severity === 'hard') && !check.passed)
    .map((check) => ({
      constraintId: check.constraintId,
      original: check.original,
      violated: true,
      reason: check.reason,
      confidence: 1,
      suggestion: check.suggestion,
    }))
}

function buildCheckerReport(report: DeterministicValidationReport): CheckerReport {
  const hardFailures = report.checks.filter((check) => !check.passed && (check.severity === 'base' || check.severity === 'hard'))
  const softFailures = report.checks.filter((check) => !check.passed && check.severity === 'soft')

  if (hardFailures.length > 0) {
    return {
      verdict: 'retry',
      baseConstraintPass: report.baseConstraintPass,
      hardConstraintPass: report.hardConstraintPass,
      softConstraintScore: report.softConstraintScore,
      summary: 'Checker yêu cầu Pi.dev code lại vì vẫn còn base/hard constraints chưa đạt.',
      retryInstructions: hardFailures.map((item) => item.suggestion ?? `${item.constraintId}: ${item.reason}`),
      violations: hardFailures,
      userSoftWarnings: softFailures,
    }
  }

  return {
    verdict: 'accept',
    baseConstraintPass: true,
    hardConstraintPass: true,
    softConstraintScore: report.softConstraintScore,
    summary: softFailures.length === 0
      ? 'Tất cả ràng buộc đều thỏa mãn.'
      : 'Thời khóa biểu hợp lệ với base/hard constraints; còn một số ràng buộc mềm chưa thỏa.',
    retryInstructions: [],
    violations: [],
    userSoftWarnings: softFailures,
  }
}

function buildTelemetry(startedAt: number, requestId: string): SolveTelemetry {
  return {
    totalDurationMs: Date.now() - startedAt,
    compileAttempts: 0,
    repairAttempts: 0,
    solverAttempts: 0,
    llmCallCount: 0,
    tokenEstimateCharsIn: 0,
    tokenEstimateCharsOut: 0,
    inputRejected: false,
    requestId,
    totalAttempts: 0,
    noProgressCount: 0,
    guardrailStopReason: 'pi_runtime_not_configured',
  }
}

function buildRuntimeNotConfiguredResult(requestId: string, startedAt: number): TimetableSolveResult {
  return {
    status: 'error',
    verdict: 'error',
    requestId,
    message: PI_RUNTIME_NOT_CONFIGURED_MESSAGE,
    diagnostics: [
      'Đã xóa agent loop cũ để chuẩn bị chuyển hẳn sang pi.dev + checker.',
      'Cần tích hợp pi.dev runtime adapter trước khi có thể generate timetable trở lại.',
    ],
    cells: [],
    executionErrors: [],
    validationErrors: [],
    iisConstraintIds: [],
    conflictingConstraints: [],
    violations: [],
    overallAssessment: 'Hệ thống đang ở trạng thái scaffold cho kiến trúc pi.dev mới.',
    solverStats: null,
    artifactSummary: null,
    checkerReport: null,
    deterministicReport: null,
    attemptHistorySummary: [
      buildAttemptSummary('Pi.dev runtime chưa được cấu hình.', 'failed', [
        'Agent loop cũ đã bị gỡ theo yêu cầu.',
        'Bước tiếp theo là nối adapter thật sang pi.dev và checker runtime.',
      ]),
    ],
    finalReason: 'pi_runtime_not_configured',
    telemetry: buildTelemetry(startedAt, requestId),
  }
}

function buildInfeasibleResult(requestId: string, startedAt: number, reason: string, diagnostics: string[]): TimetableSolveResult {
  return {
    status: 'infeasible',
    verdict: 'infeasible',
    requestId,
    message: 'Không tạo được thời khóa biểu.',
    diagnostics,
    cells: [],
    executionErrors: [],
    validationErrors: [],
    iisConstraintIds: [],
    conflictingConstraints: [],
    violations: [],
    overallAssessment: reason,
    solverStats: null,
    artifactSummary: null,
    checkerReport: null,
    deterministicReport: null,
    attemptHistorySummary: [buildAttemptSummary(reason, 'failed', diagnostics)],
    finalReason: 'no_timetable_generated',
    telemetry: {
      ...buildTelemetry(startedAt, requestId),
      guardrailStopReason: null,
    },
  }
}

function buildSuccessResult(args: {
  requestId: string
  startedAt: number
  execution: SolverExecutionOutput
  report: DeterministicValidationReport
  checkerReport: CheckerReport
}): TimetableSolveResult {
  const softViolations = buildSoftViolations(args.report)
  return {
    status: 'solved',
    verdict: 'accept',
    requestId: args.requestId,
    message: args.checkerReport.userSoftWarnings.length === 0
      ? 'Tất cả ràng buộc đều thỏa mãn.'
      : 'Đã tạo được thời khóa biểu. Một số ràng buộc mềm chưa thỏa sẽ được báo cho người dùng.',
    diagnostics: args.execution.diagnostics,
    cells: args.execution.cells,
    executionErrors: args.execution.executionErrors,
    validationErrors: args.execution.validationErrors,
    iisConstraintIds: args.execution.iisConstraintIds,
    conflictingConstraints: [],
    violations: softViolations,
    overallAssessment: args.checkerReport.summary,
    solverStats: args.execution.solverStats,
    artifactSummary: null,
    checkerReport: args.checkerReport,
    deterministicReport: args.report,
    attemptHistorySummary: [
      buildAttemptSummary('Pi.dev tạo được timetable candidate và checker đã chốt kết quả cuối.', 'success', [
        args.checkerReport.summary,
      ]),
    ],
    finalReason: args.checkerReport.userSoftWarnings.length === 0 ? 'all_constraints_satisfied' : 'soft_constraints_pending',
    telemetry: {
      ...buildTelemetry(args.startedAt, args.requestId),
      guardrailStopReason: null,
      solverAttempts: 1,
    },
  }
}

export async function runPiOrchestratedLoop(
  input: SolverRequestPayload,
  apiKey: string,
  model: string,
  emit?: ProgressEmitter,
  requestId = randomUUID(),
  _disableLlm = false,
  deps: PiRuntimeDependencies = {},
): Promise<TimetableSolveResult> {
  const startedAt = Date.now()
  const normalized = buildSolverProblemContext(input, requestId)

  emit?.({ type: 'status', message: 'Khởi tạo pipeline pi.dev + checker...', iteration: 1, maxIterations: 1 })

  if (!deps.execute) {
    emit?.({ type: 'pi_runtime_missing', message: PI_RUNTIME_NOT_CONFIGURED_MESSAGE })
    return buildRuntimeNotConfiguredResult(requestId, startedAt)
  }

  emit?.({ type: 'phase', phase: 'pi_coder', message: 'Pi.dev coder agent đang tạo hoặc sửa solver...', iteration: 1, maxIterations: 1 })
  emit?.({ type: 'pi_coder_started', attempt: 1, message: 'Pi.dev coder bắt đầu vòng chạy đầu tiên.' })

  const execution = await deps.execute({ payload: input, requestId, apiKey, model })

  if (execution.status !== 'solved' || execution.cells.length === 0) {
    emit?.({ type: 'checker_infeasible', attempt: 1, message: 'Checker xác nhận Pi.dev chưa tạo được thời khóa biểu.' })
    return buildInfeasibleResult(
      requestId,
      startedAt,
      'Pi.dev không tạo ra được timetable candidate hợp lệ.',
      execution.diagnostics.length > 0 ? execution.diagnostics : [execution.message],
    )
  }

  emit?.({ type: 'checker_started', attempt: 1, message: 'Checker đang validate base, hard và soft constraints...' })
  const report = validateTimetableResult(normalized, execution)
  const checkerReport = buildCheckerReport(report)

  if (checkerReport.verdict === 'retry') {
    emit?.({
      type: 'checker_retry_requested',
      attempt: 1,
      message: 'Checker phát hiện base/hard constraints chưa đạt. Pi.dev cần code lại.',
      retryInstructions: checkerReport.retryInstructions,
    })

    return {
      status: 'error',
      verdict: 'retry',
      requestId,
      message: 'Checker đã phản hồi để Pi.dev code lại do còn vi phạm base/hard constraints.',
      diagnostics: execution.diagnostics,
      cells: execution.cells,
      executionErrors: execution.executionErrors,
      validationErrors: execution.validationErrors,
      iisConstraintIds: execution.iisConstraintIds,
      conflictingConstraints: [],
      violations: buildHardViolations(report),
      overallAssessment: checkerReport.summary,
      solverStats: execution.solverStats,
      artifactSummary: null,
      checkerReport,
      deterministicReport: report,
      attemptHistorySummary: [
        buildAttemptSummary('Checker reject candidate vì base/hard constraints chưa đạt.', 'retry', checkerReport.retryInstructions),
      ],
      finalReason: 'checker_requested_recode',
      telemetry: {
        ...buildTelemetry(startedAt, requestId),
        guardrailStopReason: null,
        solverAttempts: 1,
      },
    }
  }

  emit?.({
    type: 'verified',
    violations: buildSoftViolations(report),
    allSatisfied: checkerReport.userSoftWarnings.length === 0,
  })
  emit?.({ type: 'checker_accepted', attempt: 1, message: checkerReport.summary })

  return buildSuccessResult({
    requestId,
    startedAt,
    execution,
    report,
    checkerReport,
  })
}
