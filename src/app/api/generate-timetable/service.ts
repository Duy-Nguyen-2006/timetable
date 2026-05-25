import { randomUUID } from 'node:crypto'

import OpenAI from 'openai'

import type {
  AgentEvent,
  AgentLifecycleEvent,
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
import { getGeneratedSolverWorkspace, persistGeneratedSolverArtifact } from '@/lib/generated-solver-artifacts'
import { getSandboxLogPath, runSolverDirect } from '@/lib/sandbox'
import { buildSolverProblemContext } from '@/lib/timetable-problem'
import type { SolverProblemContext } from '@/lib/timetable-problem'
import { validateTimetableResult } from '@/lib/timetable-validator'

const PI_MAX_ATTEMPTS = 3
const DEFAULT_PI_MODEL = 'devstral-latest'
const DEFAULT_LOWPRIZO_BASE_URL = 'https://api.lowprizo.com/v1'
const LOWPRIZO_RESPONSE_FORMAT_INSTRUCTION = [
  'Return exactly one JSON object and no markdown fences.',
  'The JSON must match this schema:',
  '{',
  '  "status": "solved" | "infeasible" | "error",',
  '  "message": string,',
  '  "diagnostics": string[],',
  '  "cells": Array<{ day: string, period: number, classId: string, subjectId: string, teacherId: string, assignmentId?: string | null, sessionId?: string | null }>,',
  '  "iisConstraintIds": string[],',
  '  "executionErrors": string[],',
  '  "validationErrors": string[],',
  '  "violations": any[],',
  '  "solverStats": object | null,',
  '  "generatedArtifact": {',
  '    "solverCode": string,',
  '    "entrypoint": string,',
  '    "summary": string,',
  '    "assumptions": string[]',
  '  } | null',
  '}',
].join('\n')

type ProgressEmitter = (event: AgentEvent) => void

const SOLVER_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'submit_solver_code',
    description: 'Submit Python OR-Tools solver code for execution. Code MUST define solve_timetable(problem) and import from timetable_solver.base_solver_template. Returns execution result JSON with status, cells, diagnostics.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Complete Python source code',
        },
      },
      required: ['code'],
    },
  },
}

const MAX_AGENT_TURNS = 10


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
    emit?: ProgressEmitter
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
        summary: 'Checker yêu cầu coder agent sửa lại vì vẫn còn base/hard constraints chưa đạt.',

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

function getLowPrizoBaseUrl() {
  return (process.env.PI_DEV_BASE_URL || process.env.LOWPRIZO_API_BASE_URL || DEFAULT_LOWPRIZO_BASE_URL).trim()
}

function getLowPrizoChatCompletionsUrl() {
  const baseUrl = getLowPrizoBaseUrl().replace(/\/$/, '')
  return `${baseUrl}/chat/completions`
}

function createPiSdkClient(apiKey: string) {
  return new OpenAI({
    apiKey,
    baseURL: getLowPrizoBaseUrl(),
  })
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
  const runtimeProblem = buildRuntimeProblem(args.context)
  return {
    model: args.model || DEFAULT_PI_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          buildPiCoderSystemPrompt(),
          LOWPRIZO_RESPONSE_FORMAT_INSTRUCTION,
        ].join('\n\n'),
      },
      {
        role: 'user',
        content: JSON.stringify({
          requestId: args.requestId,
          attempt: args.attempt,
          coderPrompt: args.coderPrompt,
          checkerFeedback: args.checkerFeedback,
          problem: runtimeProblem,
          payload: args.payload,
        }),
      },
    ],
    temperature: 0.2,
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

function extractChatCompletionText(body: unknown) {
  if (!body || typeof body !== 'object') {
    return null
  }

  const choices = 'choices' in body ? body.choices : undefined
  if (!Array.isArray(choices) || choices.length === 0) {
    return null
  }

  const firstChoice = choices[0]
  if (!firstChoice || typeof firstChoice !== 'object' || !('message' in firstChoice)) {
    return null
  }

  const message = firstChoice.message
  if (!message || typeof message !== 'object' || !('content' in message)) {
    return null
  }

  return typeof message.content === 'string' ? message.content : null
}

function parsePiRuntimeJson(text: string) {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('LowPrizo returned an empty completion.')
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const jsonText = fencedMatch?.[1]?.trim() || trimmed
  return JSON.parse(jsonText) as Partial<SolverExecutionOutput> & {
    generatedArtifact?: Partial<GeneratedSolverArtifact> | null
    diagnostics?: string[]
  }
}

function normalizeRuntimeCells(rawCells: unknown, context: SolverProblemContext) {
  if (!Array.isArray(rawCells)) {
    return []
  }

  return rawCells.flatMap((cell) => {
    if (!cell || typeof cell !== 'object') {
      return []
    }

    const slotId = typeof cell.slotId === 'string' && cell.slotId.trim().length > 0
      ? cell.slotId
      : [cell.dayId ?? cell.day, cell.sessionId ?? cell.session, cell.period]
        .filter((part) => part !== undefined && part !== null && String(part).trim().length > 0)
        .join('-')

    const slot = context.meta.slotMap[slotId]
    if (!slot) {
      return []
    }

    const rawEntries = Array.isArray(cell.entries)
      ? cell.entries
      : [cell]

    const entries = rawEntries.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') {
        return []
      }

      const assignmentKey = typeof entry.assignmentKey === 'string' && entry.assignmentKey.trim().length > 0
        ? entry.assignmentKey
        : typeof entry.assignmentId === 'string' && entry.assignmentId.trim().length > 0
          ? entry.assignmentId
          : null

      const assignment = assignmentKey ? context.meta.assignmentMap[assignmentKey] : null

      const teacher = typeof entry.teacher === 'string' && entry.teacher.trim().length > 0
        ? entry.teacher
        : assignment?.teacherLabel ?? ''
      const subject = typeof entry.subject === 'string' && entry.subject.trim().length > 0
        ? entry.subject
        : assignment?.subjectLabel ?? ''
      const className = typeof entry.className === 'string' && entry.className.trim().length > 0
        ? entry.className
        : assignment?.classLabel ?? ''

      if (!teacher || !subject || !className) {
        return []
      }

      return [{
        assignmentKey: assignment?.id ?? assignmentKey ?? `${teacher}__${subject}__${className}`,
        teacher,
        subject,
        className,
      }]
    })

    return [{
      slotId: slot.id,
      dayId: slot.dayId,
      sessionId: slot.sessionId,
      period: slot.period,
      entries,
    }]
  })
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
    logPath: record.logPath,
  }
}

function buildLifecycleEvent(args: {
  phase: AgentLifecycleEvent['phase']
  title: string
  detail: string
  status: AgentLifecycleEvent['status']
  attempt?: number
  artifactPath?: string
  logPath?: string
  sourceHash?: string
  tags?: string[]
}): AgentLifecycleEvent {
  return {
    id: randomUUID(),
    phase: args.phase,
    title: args.title,
    detail: args.detail,
    status: args.status,
    attempt: args.attempt,
    timestamp: nowIso(),
    artifactPath: args.artifactPath,
    logPath: args.logPath,
    sourceHash: args.sourceHash,
    tags: args.tags,
  }
}

function buildLifecycleEvents(runtimeAttempts: PiRuntimeAttemptRecord[], checkerReport?: CheckerReport | null): AgentLifecycleEvent[] {
  const events: AgentLifecycleEvent[] = [
    buildLifecycleEvent({
      phase: 'thinking',
      title: 'Request normalized',
      detail: 'Đã chuẩn hóa input, constraint confirmations và problem context trước khi gọi coder.',
      status: 'completed',
      tags: ['input', 'normalization'],
    }),
  ]

  runtimeAttempts.forEach((attempt) => {
    events.push(
      buildLifecycleEvent({
        phase: 'coding',
        title: `Coder generated attempt ${attempt.attempt}`,
          detail: attempt.checkerFeedback.length > 0
            ? 'Coder agent đã code lại dựa trên feedback từ checker.'
            : 'Coder agent đã sinh candidate solver artifact đầu tiên.',

        status: attempt.executionStatus === 'error' ? 'failed' : 'completed',
        attempt: attempt.attempt,
        artifactPath: attempt.artifactPath,
        logPath: attempt.logPath,
        sourceHash: attempt.sourceHash,
        tags: ['artifact'],
      }),
      buildLifecycleEvent({
        phase: 'running',
        title: `Sandbox executed attempt ${attempt.attempt}`,
        detail: attempt.executionStatus === 'solved'
          ? 'Python runner đã thực thi artifact và trả candidate timetable.'
          : attempt.executionStatus === 'infeasible'
            ? 'Python runner đã chạy artifact nhưng không tạo được candidate hợp lệ.'
            : 'Python runner đã gặp runtime/load error khi thực thi artifact.',
        status: attempt.executionStatus === 'solved' ? 'completed' : 'failed',
        attempt: attempt.attempt,
        artifactPath: attempt.artifactPath,
        logPath: attempt.logPath,
        sourceHash: attempt.sourceHash,
        tags: ['sandbox', attempt.executionStatus],
      }),
    )
  })

  if (checkerReport) {
    events.push(buildLifecycleEvent({
      phase: 'checking',
      title: checkerReport.verdict === 'accept' ? 'Checker accepted final candidate' : 'Checker requested another pass',
      detail: checkerReport.summary,
      status: checkerReport.verdict === 'accept' ? 'completed' : checkerReport.verdict === 'retry' ? 'failed' : 'completed',
      attempt: runtimeAttempts[runtimeAttempts.length - 1]?.attempt,
      artifactPath: runtimeAttempts[runtimeAttempts.length - 1]?.artifactPath,
      logPath: runtimeAttempts[runtimeAttempts.length - 1]?.logPath,
      sourceHash: runtimeAttempts[runtimeAttempts.length - 1]?.sourceHash,
      tags: ['checker', checkerReport.verdict],
    }))

    if (checkerReport.verdict === 'retry') {
      events.push(buildLifecycleEvent({
        phase: 'fixing',
        title: 'Repair loop requested',
        detail: checkerReport.retryInstructions.join(' | ') || 'Checker yêu cầu coder sửa lại base/hard constraints.',
        status: 'active',
        attempt: runtimeAttempts[runtimeAttempts.length - 1]?.attempt,
        artifactPath: runtimeAttempts[runtimeAttempts.length - 1]?.artifactPath,
        logPath: runtimeAttempts[runtimeAttempts.length - 1]?.logPath,
        sourceHash: runtimeAttempts[runtimeAttempts.length - 1]?.sourceHash,
        tags: ['repair'],
      }))
    }
  }

  return events
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
          `Coder attempt ${attempt.attempt} kết thúc với trạng thái ${attempt.executionStatus}.`,

        attempt.executionStatus === 'error' ? 'failed' : 'retry',
        attempt.diagnostics,
        attempt.artifactPath,
        attempt.sourceHash,
      )),
      lifecycleEvents: buildLifecycleEvents(runtimeAttempts),
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
      message: 'Checker đã phản hồi để coder agent code lại do còn vi phạm base/hard constraints.',

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
            `Coder attempt ${attempt.attempt} đã chạy xong.`,

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
      lifecycleEvents: buildLifecycleEvents(args.runtimeAttempts, args.checkerReport),
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
            `Coder attempt ${attempt.attempt} đã chạy xong.`,

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
      lifecycleEvents: buildLifecycleEvents(args.runtimeAttempts, args.checkerReport),
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
  emit?: ProgressEmitter
}): Promise<SolverExecutionOutput & { generatedArtifact?: GeneratedSolverArtifact | null }> {
  //
  // STEP 1: Try template_solver directly (no LLM needed, 100% reliable)
  //
  args.emit?.({ type: 'status', message: 'Đang chạy template solver trực tiếp...', iteration: args.attempt, maxIterations: PI_MAX_ATTEMPTS })

  const runtimeProblem = buildRuntimeProblem(args.context)

  const directResult = await runSolverDirect({
    problem: runtimeProblem,
    // No solverArtifactPath → runner.py falls back to template_solver.solve_timetable
  })

  if (directResult.success) {
    const data = directResult.data
    if (data.status === 'solved' && (data.cells || []).length > 0) {
      args.emit?.({
        type: 'sandbox_finished', attempt: args.attempt,
        message: `Template solver thành công! ${(data.cells || []).filter((c: { entries?: unknown[] }) => (c.entries || []).length > 0).length} ô tiết.`,
        status: 'solved',
      })
      return {
        status: 'solved',
        message: data.message || 'Template solver đã tạo thời khóa biểu.',
        diagnostics: [...(data.diagnostics || []), 'Solved via template_solver (no LLM needed)'],
        cells: normalizeRuntimeCells(data.cells || [], args.context),
        iisConstraintIds: data.iisConstraintIds || [],
        executionErrors: data.executionErrors || [],
        validationErrors: data.validationErrors || [],
        violations: data.violations || [],
        solverStats: data.solverStats || null,
        artifactPath: data.artifactPath,
        loadError: null,
        runtimeError: null,
        generatedArtifact: null,
      }
    }

    if (data.status === 'infeasible') {
      args.emit?.({
        type: 'sandbox_finished', attempt: args.attempt,
        message: 'Template solver: bài toán infeasible.',
        status: 'infeasible',
      })
      return {
        status: 'infeasible',
        message: data.message || 'Không thể xếp thời khóa biểu hợp lệ.',
        diagnostics: [...(data.diagnostics || []), 'Infeasible via template_solver'],
        cells: [],
        iisConstraintIds: data.iisConstraintIds || [],
        executionErrors: data.executionErrors || [],
        validationErrors: data.validationErrors || [],
        violations: data.violations || [],
        solverStats: data.solverStats || null,
        loadError: null,
        runtimeError: null,
        generatedArtifact: null,
      }
    }
  }

  //
  // STEP 2: Template solver failed/errored → engage LLM coding agent
  //
  if (!args.apiKey.trim()) {
    return {
      status: 'error',
      message: 'Template solver gặp lỗi và thiếu API key để dùng LLM.',
      diagnostics: [directResult.success ? '' : (directResult as { error: string }).error, 'Missing API key.'].filter(Boolean),
      cells: [], iisConstraintIds: [], executionErrors: [], validationErrors: [],
      violations: [], solverStats: null, loadError: 'missing_api_key',
      runtimeError: 'missing_api_key', generatedArtifact: null,
    }
  }

  args.emit?.({ type: 'status', message: 'Template solver gặp lỗi. LLM agent đang code solver mới...', iteration: args.attempt, maxIterations: PI_MAX_ATTEMPTS })

  const client = createPiSdkClient(args.apiKey)
  const systemPrompt = buildPiCoderSystemPrompt()

  const templateError = directResult.success
    ? `Template solver returned status=${(directResult.data as { status: string }).status}`
    : (directResult as { error: string }).error

  const userContent = JSON.stringify({
    task: 'The default template_solver failed. Write custom solver code. Submit via submit_solver_code tool.',
    templateError,
    problem: runtimeProblem,
    checkerFeedback: args.checkerFeedback.length > 0 ? args.checkerFeedback : undefined,
  })

  const messages: Array<OpenAI.Chat.Completions.ChatCompletionMessageParam> = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userContent },
  ]

  let lastArtifact: GeneratedSolverArtifact | null = null
  let lastResult: SolverExecutionOutput | null = null
  let totalToolCalls = 0

  for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
    let completion: OpenAI.Chat.Completions.ChatCompletion
    try {
      completion = await client.chat.completions.create({
        model: args.model || DEFAULT_PI_MODEL,
        messages,
        tools: [SOLVER_TOOL],
        tool_choice: turn === 0
          ? { type: 'function' as const, function: { name: 'submit_solver_code' } }
          : 'auto' as const,
        temperature: 0.2,
      } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      return {
        status: 'error', message: 'Không thể kết nối LLM.',
        diagnostics: [`SDK error turn ${turn}: ${msg}`],
        cells: [], iisConstraintIds: [], executionErrors: [], validationErrors: [],
        violations: [], solverStats: null, loadError: msg, runtimeError: msg,
        generatedArtifact: lastArtifact,
      }
    }

    const choice = completion.choices[0]
    if (!choice) break
    messages.push(choice.message as OpenAI.Chat.Completions.ChatCompletionMessageParam)
    if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) break

    for (const toolCall of choice.message.tool_calls) {
      totalToolCalls++
      if (toolCall.function.name !== 'submit_solver_code') {
        messages.push({ role: 'tool' as const, tool_call_id: toolCall.id, content: 'Use submit_solver_code.' })
        continue
      }

      let code = ''
      try { code = JSON.parse(toolCall.function.arguments).code || '' } catch { code = '' }
      if (!code.trim()) {
        messages.push({ role: 'tool' as const, tool_call_id: toolCall.id, content: JSON.stringify({ error: 'Empty code.' }) })
        continue
      }

      const artifact = normalizeGeneratedArtifact(
        { solverCode: code, entrypoint: 'solve_timetable', summary: `LLM turn ${turn + 1}`, assumptions: args.checkerFeedback },
        args.requestId, `LLM turn ${turn + 1}`, args.checkerFeedback,
      )
      if (!artifact) {
        messages.push({ role: 'tool' as const, tool_call_id: toolCall.id, content: JSON.stringify({ error: 'Save failed.' }) })
        continue
      }
      lastArtifact = artifact

      args.emit?.({ type: 'sandbox_started', attempt: args.attempt, message: `Sandbox chạy LLM code (turn ${turn + 1})...`, artifactPath: artifact.path })

      const sandboxResult = await runSolverDirect({
        problem: runtimeProblem,
        solverArtifactPath: artifact.path,
        entrypoint: artifact.entrypoint,
      })

      if (sandboxResult.success) {
        const data = sandboxResult.data
        lastResult = data as SolverExecutionOutput
        messages.push({ role: 'tool' as const, tool_call_id: toolCall.id, content: JSON.stringify({
          status: 'success', solver_status: data.status,
          filled_cells: (data.cells || []).filter((c: { entries?: unknown[] }) => (c.entries || []).length > 0).length,
        }) })
        if (data.status === 'solved' || data.status === 'infeasible') break
      } else {
        messages.push({ role: 'tool' as const, tool_call_id: toolCall.id, content: JSON.stringify({
          status: 'error', error: (sandboxResult.error || '').slice(0, 3000),
        }) })
      }
    }
    if (lastResult && (lastResult.status === 'solved' || lastResult.status === 'infeasible')) break
  }

  if (lastResult) {
    return {
      status: lastResult.status === 'solved' || lastResult.status === 'infeasible' ? lastResult.status : 'error',
      message: lastResult.message || 'LLM agent xong.',
      diagnostics: [...(lastResult.diagnostics || []), `LLM agent: ${totalToolCalls} tool calls`],
      cells: normalizeRuntimeCells(lastResult.cells || [], args.context),
      iisConstraintIds: lastResult.iisConstraintIds || [],
      executionErrors: lastResult.executionErrors || [],
      validationErrors: lastResult.validationErrors || [],
      violations: lastResult.violations || [],
      solverStats: lastResult.solverStats || null,
      artifactPath: lastResult.artifactPath || lastArtifact?.path,
      loadError: null, runtimeError: null,
      generatedArtifact: lastArtifact,
    }
  }

  return {
    status: 'error',
    message: `Cả template solver và LLM agent đều không tạo được kết quả.`,
    diagnostics: [`Template error: ${templateError}`, `LLM tool calls: ${totalToolCalls}`],
    cells: [], iisConstraintIds: [], executionErrors: [], validationErrors: [],
    violations: [], solverStats: null, loadError: 'no_result', runtimeError: 'no_result',
    generatedArtifact: lastArtifact,
  }
}

export async function runPiOrchestratedLoop(
  input: SolverRequestPayload,
  apiKey: string,
  model: string,
  emit?: ProgressEmitter,
  requestId = randomUUID(),
  deps: PiRuntimeDependencies = {},
): Promise<TimetableSolveResult> {
  const startedAt = Date.now()
  const normalized = buildSolverProblemContext(input, requestId)
  const runtimeAttempts: PiRuntimeAttemptRecord[] = []
  const generatedArtifacts = new Map<number, GeneratedSolverArtifact>()
  let checkerFeedback: string[] = []
  let finalExecution: SolverExecutionOutput | null = null

    emit?.({ type: 'status', message: 'Khởi tạo pipeline coder + checker...', iteration: 1, maxIterations: PI_MAX_ATTEMPTS })


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
          ? 'Coder agent đang tạo solver candidate...'
          : 'Coder agent đang code lại theo feedback từ checker...',

      iteration: attempt,
      maxIterations: PI_MAX_ATTEMPTS,
    })
    emit?.({ type: 'pi_coder_started', attempt, message: `Coder agent bắt đầu attempt ${attempt}.` })
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
      emit,
    })

    emit?.({
      type: 'pi_coder_finished',
      attempt,
        message: `Coder agent đã sinh artifact cho attempt ${attempt}.`,

      artifactPath: execution.artifactPath,
      sourceHash: execution.generatedArtifact?.sourceHash ?? execution.artifactPath,
    })
    emit?.({
      type: 'sandbox_started',
      attempt,
      message: `Sandbox đang chạy artifact attempt ${attempt}.`,
      artifactPath: execution.artifactPath,
    })
    emit?.({
      type: 'sandbox_finished',
      attempt,
      message: execution.status === 'solved'
        ? `Sandbox đã chạy xong attempt ${attempt} và trả candidate timetable.`
        : execution.status === 'infeasible'
          ? `Sandbox đã chạy xong attempt ${attempt} nhưng không tạo được candidate hợp lệ.`
          : `Sandbox attempt ${attempt} gặp lỗi runtime/load.`,
      artifactPath: execution.artifactPath,
      logPath: getSandboxLogPath(execution.artifactPath) ?? undefined,
      sourceHash: execution.generatedArtifact?.sourceHash ?? execution.artifactPath,
      status: execution.status,
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
      logPath: getSandboxLogPath(execution.artifactPath) ?? undefined,
    })

      if (execution.status !== 'solved' || execution.cells.length === 0) {
        if (execution.loadError === 'missing_api_key' || execution.runtimeError === 'missing_api_key') {
            emit?.({ type: 'pi_runtime_missing', message: 'Thiếu cấu hình/API key để gọi LowPrizo runtime.' })
          } else {
            emit?.({ type: 'checker_infeasible', attempt, message: 'Checker xác nhận coder agent chưa tạo được thời khóa biểu.' })
          }
          return buildInfeasibleResult(
  
          requestId,
          startedAt,
          'Coder agent không tạo ra được timetable candidate hợp lệ.',

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
          message: 'Checker phát hiện base/hard constraints chưa đạt. Coder agent cần code lại.',

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
      'Coder agent đã dùng hết số lần retry nhưng vẫn không tạo được kết quả đạt base/hard constraints.',

    finalExecution?.diagnostics ?? ['Hết số lần retry.'],
    runtimeAttempts,
    generatedArtifacts,
    finalExecution,
    'max_attempts_reached',
  )
}
