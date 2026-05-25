import { randomUUID } from 'node:crypto'

import type {
  AgentEvent,
  AttemptSummary,
  CheckerReport,
  ConstraintViolation,
  DeterministicValidationReport,
  GeneratedSolverArtifact,
  PiRuntimeAttemptRecord,
  SolveTelemetry,
  SolverExecutionOutput,
  SolverRequestPayload,
  TimetableSolveResult,
} from '@/features/timetable/ai/types'
import { buildPiCheckerPrompt, buildPiCheckerSystemPrompt } from '@/lib/agent-prompts/checker'
import { buildPiCoderPrompt, buildPiCoderSystemPrompt } from '@/lib/agent-prompts/coder'
import { persistGeneratedSolverArtifact } from '@/lib/generated-solver-artifacts'
import { buildSolverProblemContext } from '@/lib/timetable-problem'
import type { SolverProblemContext } from '@/lib/timetable-problem'
import { validateTimetableResult } from '@/lib/timetable-validator'

const PI_MAX_ATTEMPTS = 3
const DEFAULT_PI_MODEL = 'devstral-latest'
const DEFAULT_PI_DEV_BASE_URL = 'https://api.pi.dev'
const DEFAULT_PI_DEV_GENERATE_PATH = '/v1/code/generate'

type ProgressEmitter = (event: AgentEvent) => void

type PiRuntimeDependencies = {
  execute?: (args: {
    payload: SolverRequestPayload
    requestId: string
    apiKey: string
    model: string
    coderPrompt: string
    checkerFeedback: string[]
    attempt: number
    context: SolverProblemContext
  }) => Promise<SolverExecutionOutput & { generatedArtifact?: GeneratedSolverArtifact | null }>
}

function nowIso() {
  return new Date().toISOString()
}

function buildAttemptSummary(
  attempt: number,
  phase: AttemptSummary['phase'],
  summary: string,
  status: AttemptSummary['status'],
  details?: string[],
  artifactPath?: string,
  sourceHash?: string,
): AttemptSummary {
  return {
    attempt,
    phase,
    status,
    summary,
    details,
    artifactPath,
    sourceHash,
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

function buildUserIntentSummary(payload: SolverRequestPayload) {
  return [
    `days=${payload.days.length}`,
    `sessions=${payload.sessions.length}`,
    `assignments=${payload.assignments.length}`,
    `constraints=${payload.constraints.length}`,
  ].join(', ')
}

function getPiDevBaseUrl() {
  return (process.env.PI_DEV_BASE_URL || process.env.LOWPRIZO_API_BASE_URL || DEFAULT_PI_DEV_BASE_URL).trim()
}

function getPiDevGenerateUrl() {
  const baseUrl = getPiDevBaseUrl().replace(/\/$/, '')
  const rawPath = (process.env.PI_DEV_GENERATE_PATH || DEFAULT_PI_DEV_GENERATE_PATH).trim() || DEFAULT_PI_DEV_GENERATE_PATH
  const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
  return `${baseUrl}${path}`
}

function buildRuntimeProblem(context: SolverProblemContext) {
  return {
    ...context.problem,
    parsedHard: context.parsedHard,
    parsedSoft: context.parsedSoft,
    meta: {
      teacherToAsgIds: context.problem.meta.teacherToAssignmentIds,
      classToAsgIds: context.problem.meta.classToAssignmentIds,
      subjectToAsgIds: context.problem.meta.subjectToAssignmentIds,
      slotsByDayId: context.meta.slotsByDayId,
      slotsBySessionId: context.meta.slotsBySessionId,
      slotsByPeriod: context.meta.slotsByPeriod,
      slotsByDayPeriod: context.meta.slotsByDayPeriod,
      slotsByDaySession: context.meta.slotsByDaySession,
    },
  }
}

function buildPiDevRequestBody(args: {
  payload: SolverRequestPayload
  requestId: string
  model: string
  coderPrompt: string
  checkerFeedback: string[]
  attempt: number
  context: SolverProblemContext
}) {
  return {
    requestId: args.requestId,
    model: args.model || DEFAULT_PI_MODEL,
    attempt: args.attempt,
    coderPrompt: args.coderPrompt,
    checkerFeedback: args.checkerFeedback,
    problem: buildRuntimeProblem(args.context),
    payload: args.payload,
  }
}

function normalizeGeneratedArtifact(
  artifact: Partial<GeneratedSolverArtifact> | null | undefined,
  requestId: string,
  fallbackSummary: string,
  checkerFeedback: string[],
): GeneratedSolverArtifact | null {
  if (!artifact?.solverCode) {
    return null
  }

  return persistGeneratedSolverArtifact({
    solverCode: artifact.solverCode,
    entrypoint: artifact.entrypoint?.trim() || 'solve_timetable',
    summary: artifact.summary?.trim() || fallbackSummary,
    assumptions: Array.isArray(artifact.assumptions) ? artifact.assumptions : checkerFeedback,
  }, requestId)
}

function buildCheckerFeedback(report: DeterministicValidationReport) {
  return report.checks
    .filter((check) => !check.passed && (check.severity === 'base' || check.severity === 'hard'))
    .map((check) => `${check.constraintId}: ${check.reason}${check.suggestion ? ` | ${check.suggestion}` : ''}`)
}

function buildTelemetry(startedAt: number, requestId: string, runtimeAttempts: PiRuntimeAttemptRecord[], checkerFeedbackCount: number): SolveTelemetry {
  return {
    totalDurationMs: Date.now() - startedAt,
    compileAttempts: runtimeAttempts.length,
    repairAttempts: Math.max(runtimeAttempts.length - 1, 0),
    solverAttempts: runtimeAttempts.length,
    llmCallCount: runtimeAttempts.length,
    tokenEstimateCharsIn: runtimeAttempts.reduce((sum, attempt) => sum + attempt.prompt.length, 0),
    tokenEstimateCharsOut: runtimeAttempts.reduce((sum, attempt) => sum + attempt.artifactSummary.length, 0),
    inputRejected: false,
    requestId,
    totalAttempts: runtimeAttempts.length,
    noProgressCount: 0,
    guardrailStopReason: runtimeAttempts.length >= PI_MAX_ATTEMPTS ? 'max_attempts_reached' : null,
    checkerFeedbackCount,
  }
}

function toArtifactSummary(record: PiRuntimeAttemptRecord, artifact?: GeneratedSolverArtifact | null) {
  if (!artifact && !record.artifactPath) {
    return null
  }

  return {
    path: artifact?.path ?? record.artifactPath,
    entrypoint: artifact?.entrypoint ?? 'solve_timetable',
    summary: artifact?.summary ?? record.artifactSummary,
    assumptions: artifact?.assumptions ?? record.checkerFeedback,
    sourceHash: artifact?.sourceHash ?? record.sourceHash,
    attempt: record.attempt,
  }
}

function buildInfeasibleResult(
  requestId: string,
  startedAt: number,
  reason: string,
  diagnostics: string[],
  runtimeAttempts: PiRuntimeAttemptRecord[],
  generatedArtifacts: Map<number, GeneratedSolverArtifact>,
  finalExecution: SolverExecutionOutput | null,
  finalReason: TimetableSolveResult['finalReason'],
): TimetableSolveResult {
  return {
    status: 'infeasible',
    verdict: 'infeasible',
    requestId,
    message: 'Không tạo được thời khóa biểu.',
    diagnostics,
    cells: finalExecution?.cells ?? [],
    executionErrors: finalExecution?.executionErrors ?? [],
    validationErrors: finalExecution?.validationErrors ?? [],
    iisConstraintIds: finalExecution?.iisConstraintIds ?? [],
    conflictingConstraints: [],
    violations: [],
    overallAssessment: reason,
    solverStats: finalExecution?.solverStats ?? null,
    artifactSummary: runtimeAttempts.length > 0
      ? toArtifactSummary(
        runtimeAttempts[runtimeAttempts.length - 1],
        generatedArtifacts.get(runtimeAttempts[runtimeAttempts.length - 1].attempt) ?? null,
      )
      : null,
    checkerReport: null,
    deterministicReport: null,
    attemptHistorySummary: runtimeAttempts.map((attempt) => buildAttemptSummary(
      attempt.attempt,
      'coder',
      `Pi attempt ${attempt.attempt} kết thúc với trạng thái ${attempt.executionStatus}.`,
      attempt.executionStatus === 'error' ? 'failed' : 'retry',
      attempt.diagnostics,
      attempt.artifactPath,
      attempt.sourceHash,
    )),
    finalReason,
    telemetry: buildTelemetry(startedAt, requestId, runtimeAttempts, 0),
  }
}

function buildRetryResult(args: {
  requestId: string
  startedAt: number
  execution: SolverExecutionOutput
  report: DeterministicValidationReport
  checkerReport: CheckerReport
  runtimeAttempts: PiRuntimeAttemptRecord[]
  checkerFeedback: string[]
  generatedArtifacts: Map<number, GeneratedSolverArtifact>
}): TimetableSolveResult {
  return {
    status: 'error',
    verdict: 'retry',
    requestId: args.requestId,
    message: 'Checker đã phản hồi để Pi.dev code lại do còn vi phạm base/hard constraints.',
    diagnostics: args.execution.diagnostics,
    cells: args.execution.cells,
    executionErrors: args.execution.executionErrors,
    validationErrors: args.execution.validationErrors,
    iisConstraintIds: args.execution.iisConstraintIds,
    conflictingConstraints: [],
    violations: buildHardViolations(args.report),
    overallAssessment: args.checkerReport.summary,
    solverStats: args.execution.solverStats,
    artifactSummary: toArtifactSummary(
      args.runtimeAttempts[args.runtimeAttempts.length - 1],
      args.generatedArtifacts.get(args.runtimeAttempts[args.runtimeAttempts.length - 1].attempt) ?? null,
    ),
    checkerReport: args.checkerReport,
    deterministicReport: args.report,
    attemptHistorySummary: [
      ...args.runtimeAttempts.map((attempt) => buildAttemptSummary(
        attempt.attempt,
        'coder',
        `Pi attempt ${attempt.attempt} đã chạy xong.`,
        attempt.executionStatus === 'solved' ? 'success' : attempt.executionStatus === 'error' ? 'failed' : 'retry',
        attempt.diagnostics,
        attempt.artifactPath,
        attempt.sourceHash,
      )),
      buildAttemptSummary(
        args.runtimeAttempts.length,
        'checker',
        'Checker reject candidate vì base/hard constraints chưa đạt.',
        'retry',
        args.checkerFeedback,
        args.runtimeAttempts[args.runtimeAttempts.length - 1]?.artifactPath,
        args.runtimeAttempts[args.runtimeAttempts.length - 1]?.sourceHash,
      ),
    ],
    finalReason: 'checker_requested_recode',
    telemetry: buildTelemetry(args.startedAt, args.requestId, args.runtimeAttempts, args.checkerFeedback.length),
  }
}

function buildSuccessResult(args: {
  requestId: string
  startedAt: number
  execution: SolverExecutionOutput
  report: DeterministicValidationReport
  checkerReport: CheckerReport
  runtimeAttempts: PiRuntimeAttemptRecord[]
  generatedArtifacts: Map<number, GeneratedSolverArtifact>
}): TimetableSolveResult {
  const softViolations = buildSoftViolations(args.report)
  const latestAttempt = args.runtimeAttempts[args.runtimeAttempts.length - 1]
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
    artifactSummary: latestAttempt
      ? toArtifactSummary(latestAttempt, args.generatedArtifacts.get(latestAttempt.attempt) ?? null)
      : null,
    checkerReport: args.checkerReport,
    deterministicReport: args.report,
    attemptHistorySummary: [
      ...args.runtimeAttempts.map((attempt) => buildAttemptSummary(
        attempt.attempt,
        'coder',
        `Pi attempt ${attempt.attempt} đã chạy xong.`,
        attempt.executionStatus === 'solved' ? 'success' : attempt.executionStatus === 'error' ? 'failed' : 'retry',
        attempt.diagnostics,
        attempt.artifactPath,
        attempt.sourceHash,
      )),
      buildAttemptSummary(
        latestAttempt?.attempt ?? 1,
        'checker',
        'Checker đã chốt kết quả cuối.',
        'success',
        [args.checkerReport.summary],
        latestAttempt?.artifactPath,
        latestAttempt?.sourceHash,
      ),
    ],
    finalReason: args.checkerReport.userSoftWarnings.length === 0 ? 'all_constraints_satisfied' : 'soft_constraints_pending',
    telemetry: {
      ...buildTelemetry(args.startedAt, args.requestId, args.runtimeAttempts, 0),
      guardrailStopReason: null,
    },
  }
}

async function executePiRuntimeAttempt(args: {
  payload: SolverRequestPayload
  requestId: string
  apiKey: string
  model: string
  coderPrompt: string
  checkerFeedback: string[]
  attempt: number
  context: SolverProblemContext
}): Promise<SolverExecutionOutput & { generatedArtifact?: GeneratedSolverArtifact | null }> {
  if (!args.apiKey.trim()) {
    return {
      status: 'error',
      message: 'Thiếu API key để gọi pi.dev runtime.',
      diagnostics: ['Missing x-lowprizo-api-key / apiKey for pi.dev runtime request.'],
      cells: [],
      iisConstraintIds: [],
      executionErrors: [],
      validationErrors: [],
      violations: [],
      solverStats: null,
      loadError: 'missing_api_key',
      runtimeError: 'missing_api_key',
      generatedArtifact: null,
    }
  }

  const url = getPiDevGenerateUrl()
  const fallbackSummary = `Pi.dev runtime attempt ${args.attempt} using model ${args.model || DEFAULT_PI_MODEL}.`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.apiKey}`,
        'x-api-key': args.apiKey,
        'x-request-id': args.requestId,
      },
      body: JSON.stringify(buildPiDevRequestBody(args)),
      cache: 'no-store',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown pi.dev network error'
    return {
      status: 'error',
      message: 'Không thể kết nối tới pi.dev runtime.',
      diagnostics: [`pi.dev request failed: ${message}`, `url=${url}`],
      cells: [],
      iisConstraintIds: [],
      executionErrors: [],
      validationErrors: [],
      violations: [],
      solverStats: null,
      loadError: message,
      runtimeError: message,
      generatedArtifact: null,
    }
  }

  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json')
    ? await response.json() as Partial<SolverExecutionOutput> & { generatedArtifact?: Partial<GeneratedSolverArtifact> | null; diagnostics?: string[] }
    : { message: await response.text() }

  const generatedArtifact = normalizeGeneratedArtifact(
    body.generatedArtifact,
    args.requestId,
    fallbackSummary,
    args.checkerFeedback,
  )

  const mergedDiagnostics = [
    `Pi coder prompt length: ${args.coderPrompt.length}`,
    `Pi checker feedback count: ${args.checkerFeedback.length}`,
    `pi.dev url: ${url}`,
    ...(Array.isArray(body.diagnostics) ? body.diagnostics : []),
  ]

  if (!response.ok) {
    const errorMessage = typeof body.message === 'string' && body.message.trim().length > 0
      ? body.message
      : `pi.dev runtime returned HTTP ${response.status}`

    return {
      status: 'error',
      message: errorMessage,
      diagnostics: mergedDiagnostics,
      cells: [],
      iisConstraintIds: [],
      executionErrors: [],
      validationErrors: [],
      violations: [],
      solverStats: null,
      artifactPath: generatedArtifact?.path,
      loadError: errorMessage,
      runtimeError: errorMessage,
      generatedArtifact,
    }
  }

  return {
    status: body.status === 'solved' || body.status === 'infeasible' ? body.status : 'error',
    message: typeof body.message === 'string' && body.message.trim().length > 0
      ? body.message
      : 'Pi.dev runtime đã trả kết quả.',
    diagnostics: mergedDiagnostics,
    cells: Array.isArray(body.cells) ? body.cells : [],
    iisConstraintIds: Array.isArray(body.iisConstraintIds) ? body.iisConstraintIds : [],
    executionErrors: Array.isArray(body.executionErrors) ? body.executionErrors : [],
    validationErrors: Array.isArray(body.validationErrors) ? body.validationErrors : [],
    violations: Array.isArray(body.violations) ? body.violations : [],
    solverStats: body.solverStats ?? null,
    artifactPath: body.artifactPath ?? generatedArtifact?.path,
    loadError: body.loadError ?? null,
    runtimeError: body.runtimeError ?? null,
    generatedArtifact,
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
  const runtimeAttempts: PiRuntimeAttemptRecord[] = []
  const generatedArtifacts = new Map<number, GeneratedSolverArtifact>()
  let checkerFeedback: string[] = []
  let finalExecution: SolverExecutionOutput | null = null

  emit?.({ type: 'status', message: 'Khởi tạo pipeline pi.dev + checker...', iteration: 1, maxIterations: PI_MAX_ATTEMPTS })

  for (let attempt = 1; attempt <= PI_MAX_ATTEMPTS; attempt += 1) {
    const coderPrompt = buildPiCoderPrompt({
      requestId,
      userIntentSummary: buildUserIntentSummary(input),
      previousCheckerFeedback: checkerFeedback,
    })

    emit?.({
      type: 'phase',
      phase: 'pi_coder',
      message: checkerFeedback.length === 0
        ? 'Pi.dev coder agent đang tạo solver candidate...'
        : 'Pi.dev coder agent đang code lại theo feedback từ checker...',
      iteration: attempt,
      maxIterations: PI_MAX_ATTEMPTS,
    })
    emit?.({ type: 'pi_coder_started', attempt, message: `Pi.dev coder bắt đầu attempt ${attempt}.` })
    emit?.({ type: 'debug', message: buildPiCoderSystemPrompt(), detail: coderPrompt })

    const execution = await (deps.execute ?? executePiRuntimeAttempt)({
      payload: input,
      requestId,
      apiKey,
      model,
      coderPrompt,
      checkerFeedback,
      attempt,
      context: normalized,
    })

    finalExecution = execution
    if (execution.generatedArtifact) {
      generatedArtifacts.set(attempt, execution.generatedArtifact)
    }

    runtimeAttempts.push({
      attempt,
      prompt: coderPrompt,
      checkerFeedback: [...checkerFeedback],
      artifactSummary: execution.generatedArtifact?.summary ?? execution.message,
      executionStatus: execution.status,
      diagnostics: execution.diagnostics,
      artifactPath: execution.artifactPath,
      sourceHash: execution.generatedArtifact?.sourceHash ?? execution.artifactPath,
    })

      if (execution.status !== 'solved' || execution.cells.length === 0) {
        if (execution.loadError === 'missing_api_key' || execution.runtimeError === 'missing_api_key') {
          emit?.({ type: 'pi_runtime_missing', message: 'Thiếu cấu hình/API key để gọi pi.dev runtime.' })
        } else {
          emit?.({ type: 'checker_infeasible', attempt, message: 'Checker xác nhận Pi.dev chưa tạo được thời khóa biểu.' })
        }
        return buildInfeasibleResult(

        requestId,
        startedAt,
        'Pi.dev không tạo ra được timetable candidate hợp lệ.',
        execution.diagnostics.length > 0 ? execution.diagnostics : [execution.message],
        runtimeAttempts,
        generatedArtifacts,
        execution,
        'no_timetable_generated',
      )
    }

    emit?.({ type: 'checker_started', attempt, message: 'Checker đang validate base, hard và soft constraints...' })
    emit?.({ type: 'debug', message: buildPiCheckerSystemPrompt(), detail: buildPiCheckerPrompt({ requestId, solverResult: execution, deterministicReport: validateTimetableResult(normalized, execution) }) })
    const report = validateTimetableResult(normalized, execution)
    const checkerReport = buildCheckerReport(report)

    if (checkerReport.verdict === 'retry') {
      checkerFeedback = buildCheckerFeedback(report)
      emit?.({
        type: 'checker_retry_requested',
        attempt,
        message: 'Checker phát hiện base/hard constraints chưa đạt. Pi.dev cần code lại.',
        retryInstructions: checkerReport.retryInstructions,
      })

      if (attempt >= PI_MAX_ATTEMPTS) {
        return buildRetryResult({
          requestId,
          startedAt,
          execution,
          report,
          checkerReport,
          runtimeAttempts,
          checkerFeedback,
          generatedArtifacts,
        })
      }

      continue
    }

    emit?.({
      type: 'verified',
      violations: buildSoftViolations(report),
      allSatisfied: checkerReport.userSoftWarnings.length === 0,
    })
    emit?.({ type: 'checker_accepted', attempt, message: checkerReport.summary })

    return buildSuccessResult({
      requestId,
      startedAt,
      execution,
      report,
      checkerReport,
      runtimeAttempts,
      generatedArtifacts,
    })
  }

  return buildInfeasibleResult(
    requestId,
    startedAt,
    'Pi.dev đã dùng hết số lần retry nhưng vẫn không tạo được kết quả đạt base/hard constraints.',
    finalExecution?.diagnostics ?? ['Hết số lần retry.'],
    runtimeAttempts,
    generatedArtifacts,
    finalExecution,
    'max_attempts_reached',
  )
}
