import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import type {
  AgentEvent,
  AttemptSummary,
  CheckerReport,
  ConstraintCheckItem,
  ConstraintViolation,
  DeterministicValidationReport,
  GeneratedSolverArtifact,
  SolverExecutionOutput,
  TimetableSolveResult,
} from '@/features/timetable/ai/types'
import { buildCheckerPrompt, buildCheckerSystemPrompt } from '@/lib/agent-prompts/checker'
import { buildCoderPrompt, buildCoderSystemPrompt } from '@/lib/agent-prompts/coder'
import {
  cleanupSolverArtifact,
  getBaseSolverTemplatePath,
  persistGeneratedSolverArtifact,
  readBaseSolverTemplate,
} from '@/lib/generated-solver-artifacts'
import { runSolverDirect } from '@/lib/sandbox'
import type { InputPayload } from '@/lib/timetable-prompt'
import { buildNormalizedSolverProblem } from '@/lib/timetable-problem'
import type { NormalizedSolverProblem } from '@/lib/timetable-problem'
import { validateTimetableResult } from '@/lib/timetable-validator'

const LOOP_PROGRESS_WINDOW = 3
const REQUEST_TIMEOUT_MS = 120_000
const NO_PROGRESS_LIMIT = 2
const TOKEN_BUDGET_CHARS = 250_000
const LOWPRIZO_API_TIMEOUT_MS = 45_000
const LOWPRIZO_API_BASE_URL = process.env.LOWPRIZO_API_BASE_URL || 'https://api.lowprizo.com/v1'
const LOWPRIZO_MODEL = process.env.LOWPRIZO_MODEL || 'devstral-latest'

const FALLBACK_TEMPLATE_PATH = 'python/timetable_solver/template_solver.py'

function resolveFallbackTemplatePath() {
  const cwdCandidate = path.join(process.cwd(), FALLBACK_TEMPLATE_PATH)
  if (existsSync(cwdCandidate)) return cwdCandidate

  const runnerDir = process.env.TIMETABLE_PYTHON_RUNNER_DIR
  if (runnerDir) {
    const packagedCandidate = path.resolve(runnerDir, '..', 'python-src', 'timetable_solver', 'template_solver.py')
    if (existsSync(packagedCandidate)) return packagedCandidate
  }

  return cwdCandidate
}

function resolveFallbackTemplateDiagnostics() {
  const cwdCandidate = path.join(process.cwd(), FALLBACK_TEMPLATE_PATH)
  const runnerDir = process.env.TIMETABLE_PYTHON_RUNNER_DIR
  const packagedCandidate = runnerDir
    ? path.resolve(runnerDir, '..', 'python-src', 'timetable_solver', 'template_solver.py')
    : null
  const resolvedPath = resolveFallbackTemplatePath()

  return {
    cwd: process.cwd(),
    fallbackTemplatePath: FALLBACK_TEMPLATE_PATH,
    cwdCandidate,
    cwdCandidateExists: existsSync(cwdCandidate),
    runnerDir: runnerDir ?? null,
    packagedCandidate,
    packagedCandidateExists: packagedCandidate ? existsSync(packagedCandidate) : false,
    resolvedPath,
    resolvedPathExists: existsSync(resolvedPath),
  }
}

function nowIso() {
  return new Date().toISOString()
}

function elapsedMs(startedAt: number) {
  return Date.now() - startedAt
}

function estimateTokenChars(...values: Array<string | undefined | null>) {
  return values.filter(Boolean).join('\n').length
}

function buildConstraintViolationsFromReport(report: DeterministicValidationReport): ConstraintViolation[] {
  return report.checks
    .filter((item) => !item.passed)
    .map((item) => ({
      constraintId: item.constraintId,
      original: item.original,
      violated: item.severity !== 'soft',
      reason: item.reason,
      confidence: item.severity === 'base' ? 1 : 0.85,
      suggestion: item.suggestion,
    }))
}

function makeAttempt(
  attempt: number,
  phase: AttemptSummary['phase'],
  status: AttemptSummary['status'],
  summary: string,
  extra?: Partial<AttemptSummary>,
): AttemptSummary {
  return {
    attempt,
    phase,
    status,
    summary,
    startedAt: extra?.startedAt ?? nowIso(),
    finishedAt: extra?.finishedAt ?? nowIso(),
    details: extra?.details,
    artifactPath: extra?.artifactPath,
    sourceHash: extra?.sourceHash,
  }
}

function buildCheckerReport(report: DeterministicValidationReport): CheckerReport {
  const violations = report.checks.filter((item) => !item.passed)
  const hardOrBaseFailures = violations.filter((item) => item.severity === 'base' || item.severity === 'hard')
  const primaryFailure = hardOrBaseFailures[0]

  return {
    verdict: hardOrBaseFailures.length > 0 ? 'retry' : 'accept',
    baseConstraintPass: report.baseConstraintPass,
    hardConstraintPass: report.hardConstraintPass,
    softConstraintScore: report.softConstraintScore,
    summary: hardOrBaseFailures.length > 0
      ? primaryFailure
        ? `Checker yêu cầu retry: ${primaryFailure.original}. ${primaryFailure.reason}`
        : 'Checker yêu cầu retry vì còn vi phạm base/hard constraints.'
      : 'Checker accept vì pass base/hard constraints.',
    retryInstructions: hardOrBaseFailures.map((item) => item.suggestion ?? `Sửa constraint ${item.constraintId}`),
    violations,
  }
}

function composeArtifactSummary(artifact: GeneratedSolverArtifact | null) {
  if (!artifact) return null
  return {
    path: artifact.path,
    entrypoint: artifact.entrypoint,
    summary: artifact.summary,
    assumptions: artifact.assumptions,
    sourceHash: artifact.sourceHash,
  }
}

function createBaseFallbackSolverCode() {
  const diagnostics = resolveFallbackTemplateDiagnostics()
  console.error('[generate-timetable] fallback template resolution', diagnostics)

  const resolvedPath = resolveFallbackTemplatePath()
  if (existsSync(resolvedPath)) {
    return readFileSync(resolvedPath, 'utf8')
  }

  console.error(
    '[generate-timetable] fallback template not found; falling back to base solver template',
    diagnostics,
  )
  return readBaseSolverTemplate()
}

function buildFallbackArtifact(args: {
  normalized: NormalizedSolverProblem
  attempt: number
  checkerFeedback: string[]
  fallbackReason?: string
}) {
  const solverCode = createBaseFallbackSolverCode()
  const assumptions = [
    'Canonical template solver được dùng làm deterministic coder artifact an toàn nhất.',
    ...args.checkerFeedback,
  ]

  if (args.fallbackReason) {
    assumptions.unshift(`LLM coder fallback: ${args.fallbackReason}`)
  }

  const artifact = persistGeneratedSolverArtifact({
    solverCode,
    entrypoint: 'solve_timetable',
    summary: args.fallbackReason
      ? `Attempt ${args.attempt} fallback về canonical template solver sau khi LLM coder không khả dụng.`
      : args.attempt === 1
        ? 'Dùng canonical template solver làm coder artifact ban đầu.'
        : `Retry attempt ${args.attempt} dùng canonical template solver với feedback checker đi kèm.`,
    assumptions,
  }, args.normalized.requestId)

  return {
    artifact,
    promptCharsOut: solverCode.length,
  }
}

function extractPythonCodeBlock(content: string) {
  const fenced = content.match(/```(?:python)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]?.trim()) return fenced[1].trim()
  return content.trim()
}

function extractAssistantContent(payload: unknown) {
  if (!payload || typeof payload !== 'object') return ''
  const choices = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices
  const rawContent = choices?.[0]?.message?.content

  if (typeof rawContent === 'string') return rawContent
  if (Array.isArray(rawContent)) {
    return rawContent
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
          return item.text
        }
        return ''
      })
      .join('\n')
      .trim()
  }

  return ''
}

async function generateSolverCodeWithLowprizo(args: {
  apiKey: string
  model: string
  coderSystemPrompt: string
  coderPrompt: string
}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), LOWPRIZO_API_TIMEOUT_MS)

  try {
    const response = await fetch(`${LOWPRIZO_API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.apiKey}`,
        'x-api-key': args.apiKey,
      },
      body: JSON.stringify({
        model: args.model || LOWPRIZO_MODEL,
        temperature: 0.2,
        messages: [
          { role: 'system', content: args.coderSystemPrompt },
          {
            role: 'user',
            content: [
              args.coderPrompt,
              '',
              'Base solver template for reference:',
              createBaseFallbackSolverCode(),
            ].join('\n'),
          },
        ],
      }),
      cache: 'no-store',
      signal: controller.signal,
    })

    if (!response.ok) {
      const contentType = response.headers.get('content-type') || ''
      const body = contentType.includes('application/json') ? JSON.stringify(await response.json()) : await response.text()
      throw new Error(`Lowprizo coder request failed with ${response.status}: ${body.slice(0, 500)}`)
    }

    const payload = await response.json()
    const messageContent = extractAssistantContent(payload)
    const solverCode = extractPythonCodeBlock(messageContent)

    if (!solverCode) {
      throw new Error('Lowprizo coder response did not contain solver source code.')
    }

    return solverCode
  } finally {
    clearTimeout(timeoutId)
  }
}

async function runCoderAttempt(
  normalized: NormalizedSolverProblem,
  attempt: number,
  checkerFeedback: string[],
  previousArtifact: GeneratedSolverArtifact | null,
  apiKey: string,
  model: string,
  disableLlm = false,
  emit?: (event: AgentEvent) => void,
): Promise<{ artifact: GeneratedSolverArtifact; promptCharsIn: number; promptCharsOut: number }> {
  emit?.({
    type: 'coder_started',
    attempt,
    message: `Coder bắt đầu attempt ${attempt}.`,
  })

  const coderSystemPrompt = buildCoderSystemPrompt()
  const coderPrompt = buildCoderPrompt({
    normalized,
    baseTemplatePath: getBaseSolverTemplatePath(),
    checkerFeedback,
    previousArtifactSummary: previousArtifact?.summary ?? null,
  })
  const promptCharsIn = estimateTokenChars(coderSystemPrompt, coderPrompt)

  if (disableLlm || !apiKey.trim()) {
    const fallback = buildFallbackArtifact({
      normalized,
      attempt,
      checkerFeedback,
      fallbackReason: disableLlm ? 'LLM bị tắt bởi runtime flag.' : 'Thiếu Lowprizo API key ở runtime.',
    })

    emit?.({
      type: 'coder_artifact_generated',
      attempt,
      summary: fallback.artifact.summary,
      artifactPath: fallback.artifact.path,
      sourceHash: fallback.artifact.sourceHash,
    })

    return {
      artifact: fallback.artifact,
      promptCharsIn,
      promptCharsOut: fallback.promptCharsOut,
    }
  }

  try {
    const solverCode = await generateSolverCodeWithLowprizo({
      apiKey,
      model,
      coderSystemPrompt,
      coderPrompt,
    })

    const artifact = persistGeneratedSolverArtifact({
      solverCode,
      entrypoint: 'solve_timetable',
      summary: attempt === 1
        ? 'Lowprizo coder đã sinh solver artifact cho attempt ban đầu.'
        : `Lowprizo coder đã sinh solver artifact cho retry attempt ${attempt}.`,
      assumptions: [
        'Generated qua Lowprizo OpenAI-compatible chat completions API.',
        ...checkerFeedback,
      ],
    }, normalized.requestId)

    emit?.({
      type: 'coder_artifact_generated',
      attempt,
      summary: artifact.summary,
      artifactPath: artifact.path,
      sourceHash: artifact.sourceHash,
    })

    return {
      artifact,
      promptCharsIn,
      promptCharsOut: solverCode.length,
    }
  } catch (error) {
    const fallbackReason = error instanceof Error ? error.message : 'Unknown Lowprizo coder error.'
    emit?.({
      type: 'debug',
      message: 'Lowprizo coder call failed, switching to canonical fallback.',
      detail: fallbackReason,
    })

    const fallback = buildFallbackArtifact({
      normalized,
      attempt,
      checkerFeedback,
      fallbackReason,
    })

    emit?.({
      type: 'coder_artifact_generated',
      attempt,
      summary: fallback.artifact.summary,
      artifactPath: fallback.artifact.path,
      sourceHash: fallback.artifact.sourceHash,
    })

    return {
      artifact: fallback.artifact,
      promptCharsIn,
      promptCharsOut: fallback.promptCharsOut,
    }
  }
}

async function executeSolver(
  normalized: NormalizedSolverProblem,
  artifact: GeneratedSolverArtifact,
  attempt: number,
  emit?: (event: AgentEvent) => void,
): Promise<SolverExecutionOutput> {
  emit?.({
    type: 'coder_run_started',
    attempt,
    message: `Đang chạy Python solver cho attempt ${attempt}.`,
  })

  const executed = await runSolverDirect({
    problem: normalized.problem,
    solverArtifactPath: artifact.path,
    entrypoint: artifact.entrypoint,
  })

  if (!executed.success) {
    emit?.({
      type: 'coder_run_failed',
      attempt,
      error: executed.error,
    })

    return {
      status: 'error',
      message: 'Runner không thực thi được solver artifact.',
      diagnostics: [executed.error],
      cells: [],
      iisConstraintIds: [],
      executionErrors: [{ constraintId: `runner_${attempt}`, error: executed.error }],
      validationErrors: [],
      violations: [],
      solverStats: null,
      artifactPath: artifact.path,
      loadError: executed.error,
      runtimeError: executed.error,
    }
  }

  const nonEmptyCells = executed.data.cells.filter((cell) => (cell.entries ?? []).length > 0)
  const totalEntries = nonEmptyCells.reduce((sum, cell) => sum + (cell.entries?.length ?? 0), 0)
  const missingAssignmentKeys = nonEmptyCells.flatMap((cell) =>
    (cell.entries ?? [])
      .filter((entry) => !entry.assignmentKey || typeof entry.assignmentKey !== 'string')
      .map(() => cell.slotId),
  )
  console.error('[generate-timetable] solver execution summary', {
    attempt,
    artifactPath: artifact.path,
    artifactSourceHash: artifact.sourceHash,
    solverResultStatus: executed.data.status,
    solverResultArtifactPath: executed.data.artifactPath ?? null,
    totalCells: executed.data.cells.length,
    nonEmptyCells: nonEmptyCells.length,
    totalEntries,
    missingAssignmentKeyCount: missingAssignmentKeys.length,
    missingAssignmentKeySlots: missingAssignmentKeys.slice(0, 10),
    sampleEntries: nonEmptyCells.slice(0, 3).map((cell) => ({
      slotId: cell.slotId,
      entries: (cell.entries ?? []).map((entry) => ({
        assignmentKey: entry.assignmentKey,
        teacher: entry.teacher,
        subject: entry.subject,
        className: entry.className,
      })),
    })),
  })

  if (executed.data.status === 'error') {
    emit?.({
      type: 'coder_runtime_error',
      attempt,
      error: executed.data.message,
    })
  }

  return executed.data
}

function shouldContinueLoop(args: {
  startedAt: number
  totalChars: number
  noProgressCount: number
  retryInstructions: string[]
}) {
  if (elapsedMs(args.startedAt) > REQUEST_TIMEOUT_MS) {
    return { continue: false, reason: 'request_timeout' }
  }
  if (args.totalChars > TOKEN_BUDGET_CHARS) {
    return { continue: false, reason: 'token_budget_exceeded' }
  }
  if (args.noProgressCount >= NO_PROGRESS_LIMIT) {
    return { continue: false, reason: 'no_progress' }
  }
  if (args.retryInstructions.length === 0) {
    return { continue: false, reason: 'empty_retry_plan' }
  }
  return { continue: true as const, reason: null }
}

function finalizeResult(input: {
  requestId: string
  status: TimetableSolveResult['status']
  verdict: TimetableSolveResult['verdict']
  message: string
  diagnostics: string[]
  normalized: NormalizedSolverProblem
  artifact: GeneratedSolverArtifact | null
  solverResult: SolverExecutionOutput | null
  deterministicReport: DeterministicValidationReport | null
  checkerReport: CheckerReport | null
  attempts: AttemptSummary[]
  telemetry: TimetableSolveResult['telemetry']
  finalReason: string
}): TimetableSolveResult {
  const reportViolations = input.deterministicReport ? buildConstraintViolationsFromReport(input.deterministicReport) : []
  const solverViolations = input.solverResult?.violations ?? []

  return {
    status: input.status,
    verdict: input.verdict,
    requestId: input.requestId,
    message: input.message,
    diagnostics: [...(input.solverResult?.diagnostics ?? []), ...input.diagnostics],
    cells: input.solverResult?.cells ?? [],
    executionErrors: input.solverResult?.executionErrors ?? [],
    validationErrors: input.solverResult?.validationErrors ?? [],
    iisConstraintIds: input.solverResult?.iisConstraintIds ?? [],
    conflictingConstraints: input.normalized.payload.hardConstraints
      .filter((item) => (input.solverResult?.iisConstraintIds ?? []).includes(item.id))
      .map((item) => ({ id: item.id, text: item.text })),
    violations: solverViolations.length > 0 ? solverViolations : reportViolations,
    overallAssessment: input.checkerReport?.summary ?? input.deterministicReport?.summary ?? null,
    solverStats: input.solverResult?.solverStats ?? null,
    artifactSummary: composeArtifactSummary(input.artifact),
    checkerReport: input.checkerReport,
    deterministicReport: input.deterministicReport,
    attemptHistorySummary: input.attempts,
    finalReason: input.finalReason,
    telemetry: input.telemetry,
  }
}

export async function runAgenticLoop(
  payload: InputPayload,
  apiKey: string,
  model: string,
  emit?: (event: AgentEvent) => void,
  requestId = 'request-pending',
  disableLlm = false,
  requestInput?: { constraintConfirmations?: Array<{ id: string; original: string; interpreted: string; accepted: boolean }>; days?: Array<{ id: string; label: string }>; sessions?: Array<{ id: string; label: string }>; assignments?: Array<{ teacher: string; subject: string; className: string; weeklyPeriods: number | string }>; constraints?: Array<{ type: 'required' | 'preferred'; text: string; weight?: number }> },
): Promise<TimetableSolveResult> {
  const startedAt = Date.now()
  let totalChars = 0
  let noProgressCount = 0
  let lastSourceHash: string | undefined
  let compileAttempts = 0
  let repairAttempts = 0
  let solverAttempts = 0
  let llmCallCount = 0
  const attempts: AttemptSummary[] = []
  const diagnostics: string[] = []

  const normalized = buildNormalizedSolverProblem({
    apiKey: '',
    days: requestInput?.days ?? [],
    sessions: requestInput?.sessions ?? [],
    periodCounts: {},
    deletedPeriods: {},
    assignments: requestInput?.assignments ?? [],
    constraints: requestInput?.constraints ?? [],
    constraintConfirmations: requestInput?.constraintConfirmations,
  }, payload, requestId)

  emit?.({
    type: 'phase',
    phase: 'normalize_input',
    message: 'Đã normalize payload thành solver problem dùng chung.',
    iteration: 1,
    maxIterations: LOOP_PROGRESS_WINDOW,
  })

  let currentArtifact: GeneratedSolverArtifact | null = null
  let finalSolverResult: SolverExecutionOutput | null = null
  let finalDeterministicReport: DeterministicValidationReport | null = null
  let finalCheckerReport: CheckerReport | null = null
  let finalStatus: TimetableSolveResult['status'] = 'error'
  let finalVerdict: TimetableSolveResult['verdict'] = 'error'
  let finalReason = 'unknown'

  try {
    for (let attempt = 1; ; attempt += 1) {
      emit?.({
        type: 'loop_progress',
        attempt,
        maxIterations: Math.max(attempt, LOOP_PROGRESS_WINDOW),
        message: `Bắt đầu loop attempt ${attempt}.`,
      })

      const coder = await runCoderAttempt(normalized, attempt, finalCheckerReport?.retryInstructions ?? [], currentArtifact, apiKey || process.env.LOWPRIZO_API_KEY || '', model || LOWPRIZO_MODEL, disableLlm, emit)
      llmCallCount += 1
      totalChars += coder.promptCharsIn + coder.promptCharsOut
      compileAttempts += 1
      currentArtifact = coder.artifact
      solverAttempts += 1

      if (lastSourceHash && lastSourceHash === currentArtifact.sourceHash) {
        noProgressCount += 1
      } else {
        noProgressCount = 0
      }
      lastSourceHash = currentArtifact.sourceHash

      finalSolverResult = await executeSolver(normalized, currentArtifact, attempt, emit)

      if (finalSolverResult.status === 'error') {
        repairAttempts += 1
        attempts.push(makeAttempt(attempt, 'coder', 'failed', finalSolverResult.message, {
          artifactPath: currentArtifact.path,
          sourceHash: currentArtifact.sourceHash,
          details: finalSolverResult.diagnostics,
        }))

        const decision = shouldContinueLoop({
          startedAt,
          totalChars,
          noProgressCount,
          retryInstructions: finalCheckerReport?.retryInstructions ?? ['retry_after_runtime_error'],
        })
        if (!decision.continue) {
          finalStatus = 'error'
          finalVerdict = 'error'
          finalReason = decision.reason ?? 'coder_error_stop'
          diagnostics.push(`Dừng loop tại coder error vì ${decision.reason}.`)
          break
        }
        continue
      }

      emit?.({
        type: 'phase',
        phase: 'deterministic_validation',
        message: `Đang validate deterministic cho attempt ${attempt}.`,
        iteration: attempt,
        maxIterations: Math.max(attempt, LOOP_PROGRESS_WINDOW),
      })

      finalDeterministicReport = validateTimetableResult(normalized, finalSolverResult)
      finalCheckerReport = buildCheckerReport(finalDeterministicReport)
      attempts.push(makeAttempt(attempt, 'validation', finalDeterministicReport.valid ? 'success' : 'retry', finalDeterministicReport.summary, {
        artifactPath: currentArtifact.path,
        sourceHash: currentArtifact.sourceHash,
      }))

      emit?.({
        type: 'checker_started',
        attempt,
        message: `Checker đang đánh giá attempt ${attempt}.`,
      })

      const checkerPromptChars = estimateTokenChars(
        buildCheckerSystemPrompt(),
        buildCheckerPrompt({
          normalized,
          solverResult: finalSolverResult,
          deterministicReport: finalDeterministicReport,
          artifactSummary: currentArtifact.summary,
        }),
      )
      totalChars += checkerPromptChars

      if (finalSolverResult.status === 'infeasible') {
        finalStatus = 'infeasible'
        finalVerdict = 'infeasible'
        finalReason = 'solver_infeasible'
        attempts.push(makeAttempt(attempt, 'checker', 'success', 'Checker xác nhận infeasible từ solver result.'))
        emit?.({
          type: 'checker_infeasible',
          attempt,
          message: 'Checker kết luận infeasible.',
        })
        break
      }

      if (finalCheckerReport.verdict === 'accept') {
        finalStatus = 'solved'
        finalVerdict = 'accept'
        finalReason = 'accepted'
        attempts.push(makeAttempt(attempt, 'checker', 'success', finalCheckerReport.summary))
        emit?.({
          type: 'checker_accepted',
          attempt,
          message: finalCheckerReport.summary,
        })
        break
      }

      repairAttempts += 1
      attempts.push(makeAttempt(attempt, 'checker', 'retry', finalCheckerReport.summary, {
        details: finalCheckerReport.retryInstructions,
        artifactPath: currentArtifact.path,
        sourceHash: currentArtifact.sourceHash,
      }))
      emit?.({
        type: 'checker_retry_requested',
        attempt,
        message: finalCheckerReport.summary,
        retryInstructions: finalCheckerReport.retryInstructions,
      })

      const decision = shouldContinueLoop({
        startedAt,
        totalChars,
        noProgressCount,
        retryInstructions: finalCheckerReport.retryInstructions,
      })
      if (!decision.continue) {
        finalStatus = 'error'
        finalVerdict = 'error'
        finalReason = decision.reason ?? 'retry_stop'
        diagnostics.push(`Dừng loop sau checker retry vì ${decision.reason}.`)
        break
      }
    }
  } finally {
    if (currentArtifact && finalStatus === 'solved') {
      cleanupSolverArtifact(requestId)
    }
  }

  const telemetry = {
    totalDurationMs: elapsedMs(startedAt),
    compileAttempts,
    repairAttempts,
    solverAttempts,
    llmCallCount,
    tokenEstimateCharsIn: totalChars,
    tokenEstimateCharsOut: currentArtifact?.solverCode.length ?? 0,
    inputRejected: false,
    requestId,
    totalAttempts: attempts.length,
    noProgressCount,
    guardrailStopReason: finalStatus === 'error' ? finalReason : null,
  }

  return finalizeResult({
    requestId,
    status: finalStatus,
    verdict: finalVerdict,
    message: finalStatus === 'solved'
      ? 'Đã tạo thời khóa biểu hợp lệ.'
      : finalStatus === 'infeasible'
        ? 'Không thể tạo thời khóa biểu hợp lệ với ràng buộc hiện tại.'
        : 'Pipeline generate timetable dừng do guardrail hoặc lỗi runtime.',
    diagnostics,
    normalized,
    artifact: currentArtifact,
    solverResult: finalSolverResult,
    deterministicReport: finalDeterministicReport,
    checkerReport: finalCheckerReport,
    attempts,
    telemetry,
    finalReason,
  })
}
