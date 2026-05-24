import { createHash } from 'node:crypto'

import type {
  AgentEvent,
  GeneratedSolverArtifact,
  PipelineTelemetry,
  SolverExecutionOutput,
  TimetableSolveResult,
  VerifierAssessment,
} from '@/features/timetable/ai/types'
import {
  SOLVER_AUTHOR_SYSTEM_PROMPT,
  SOLVER_VERIFY_SYSTEM_PROMPT,
  buildSolverAuthorUserMessage,
  buildSolverVerifyUserMessage,
} from '@/lib/timetable-agent-prompts'
import { persistGeneratedSolverArtifact } from '@/lib/generated-solver-artifacts'
import { chatCompletion } from '@/lib/llm-client'
import { preprocessInputPayload } from '@/lib/preprocess'
import { runSolverDirect } from '@/lib/sandbox'
import type { InputPayload } from '@/lib/timetable-prompt'

type RuntimeCounters = {
  generationAttempts: number
  verificationAttempts: number
  solverAttempts: number
  llmCallCount: number
  charsIn: number
  charsOut: number
}

type SolverAuthorResponse = {
  solverCode: string
  entrypoint: string
  summary: string
  assumptions?: string[]
}

function estimateTokenChars(messages: Array<{ content: string }>): number {
  return messages.reduce((sum, message) => sum + message.content.length, 0)
}

function buildTelemetry(startedAt: number, counters: RuntimeCounters, inputRejected: boolean): PipelineTelemetry {
  return {
    totalDurationMs: Date.now() - startedAt,
    compileAttempts: counters.generationAttempts,
    repairAttempts: counters.verificationAttempts,
    solverAttempts: counters.solverAttempts,
    llmCallCount: counters.llmCallCount,
    tokenEstimateCharsIn: counters.charsIn,
    tokenEstimateCharsOut: counters.charsOut,
    inputRejected,
  }
}

function toArtifactSummary(artifact: GeneratedSolverArtifact) {
  return {
    id: artifact.sourceHash ?? createHash('sha256').update(artifact.solverCode).digest('hex'),
    description: artifact.summary,
    original: 'AI generated solver artifact',
    priority: 'hard' as const,
    code: artifact.solverCode,
    checkerCode: '',
  }
}

function normalizeVerifierAssessment(raw: string): VerifierAssessment {
  const fallback: VerifierAssessment = {
    verdict: 'retryable',
    confidence: 0,
    rationale: 'Verifier không trả về JSON hợp lệ.',
    unmetRequirements: ['Verifier output invalid JSON'],
    repairInstructions: ['Trả JSON hợp lệ theo schema verifier.'],
    confidentlyInfeasible: false,
  }

  try {
    const parsed = JSON.parse(raw) as Partial<VerifierAssessment>
    if (!parsed || typeof parsed !== 'object') return fallback
    return {
      verdict: parsed.verdict === 'solved' || parsed.verdict === 'infeasible' ? parsed.verdict : 'retryable',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      rationale: typeof parsed.rationale === 'string' ? parsed.rationale : fallback.rationale,
      unmetRequirements: Array.isArray(parsed.unmetRequirements) ? parsed.unmetRequirements.map(String) : [],
      repairInstructions: Array.isArray(parsed.repairInstructions) ? parsed.repairInstructions.map(String) : [],
      confidentlyInfeasible: Boolean(parsed.confidentlyInfeasible),
    }
  } catch {
    return fallback
  }
}

function normalizeAuthorResponse(raw: string, baseSolverCode: string): SolverAuthorResponse {
  const fallback: SolverAuthorResponse = {
    solverCode: baseSolverCode,
    entrypoint: 'solve_timetable',
    summary: 'Fallback to base solver template due to invalid author response.',
    assumptions: ['Agent 1 did not return valid JSON'],
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SolverAuthorResponse>
    if (!parsed || typeof parsed !== 'object' || typeof parsed.solverCode !== 'string' || !parsed.solverCode.trim()) {
      return fallback
    }
    return {
      solverCode: parsed.solverCode,
      entrypoint: typeof parsed.entrypoint === 'string' && parsed.entrypoint.trim() ? parsed.entrypoint : 'solve_timetable',
      summary: typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary : 'Generated solver artifact',
      assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions.map(String) : [],
    }
  } catch {
    return fallback
  }
}

function toSolverProblem(payload: InputPayload) {
  return {
    slots: payload.slots.map((slot) => ({
      slotId: slot.id,
      dayId: slot.dayId,
      dayLabel: slot.dayLabel,
      sessionId: slot.sessionId,
      sessionLabel: slot.sessionLabel,
      period: slot.period,
    })),
    assignments: payload.assignments.map((assignment) => ({
      assignmentId: assignment.id,
      teacherId: assignment.teacherId,
      teacherLabel: assignment.teacherLabel,
      classId: assignment.classId,
      classLabel: assignment.classLabel,
      subjectId: assignment.subjectId,
      subjectLabel: assignment.subjectLabel,
      weeklyPeriods: assignment.weeklyPeriods,
    })),
    solverConfig: {
      maxTimeSeconds: payload.slots.length * payload.assignments.length > 1500 ? 25 : 15,
      numWorkers: payload.slots.length * payload.assignments.length > 2500 ? 3 : 2,
      randomSeed: 1,
    },
  }
}

async function generateSolverArtifact(input: {
  payload: InputPayload
  apiKey: string
  model: string
  baseSolverCode: string
  previousArtifact: GeneratedSolverArtifact | null
  previousRun: SolverExecutionOutput | null
  previousVerification: VerifierAssessment | null
  attempt: number
  maxAttempts: number
  counters: RuntimeCounters
}): Promise<GeneratedSolverArtifact> {
  const userMessage = buildSolverAuthorUserMessage({
    payload: input.payload,
    baseSolverCode: input.baseSolverCode,
    previousArtifact: input.previousArtifact,
    previousRun: input.previousRun,
    previousVerification: input.previousVerification,
    attempt: input.attempt,
    maxAttempts: input.maxAttempts,
  })

  const messages = [
    { role: 'system' as const, content: SOLVER_AUTHOR_SYSTEM_PROMPT },
    { role: 'user' as const, content: userMessage },
  ]

  input.counters.generationAttempts += 1
  input.counters.llmCallCount += 1
  input.counters.charsIn += estimateTokenChars(messages)
  const response = await chatCompletion(messages, input.apiKey, input.model)
  input.counters.charsOut += response.length

  const normalized = normalizeAuthorResponse(response, input.baseSolverCode)
  return persistGeneratedSolverArtifact({
    solverCode: normalized.solverCode,
    entrypoint: normalized.entrypoint,
    summary: normalized.summary,
    assumptions: normalized.assumptions,
  })
}

async function verifySolverOutput(input: {
  payload: InputPayload
  artifact: GeneratedSolverArtifact
  runOutput: SolverExecutionOutput
  apiKey: string
  model: string
  counters: RuntimeCounters
}): Promise<VerifierAssessment> {
  const userMessage = buildSolverVerifyUserMessage({
    payload: input.payload,
    artifact: input.artifact,
    runOutput: input.runOutput,
  })

  const messages = [
    { role: 'system' as const, content: SOLVER_VERIFY_SYSTEM_PROMPT },
    { role: 'user' as const, content: userMessage },
  ]

  input.counters.verificationAttempts += 1
  input.counters.llmCallCount += 1
  input.counters.charsIn += estimateTokenChars(messages)
  const response = await chatCompletion(messages, input.apiKey, input.model)
  input.counters.charsOut += response.length
  return normalizeVerifierAssessment(response)
}

function createResult(params: {
  status: 'solved' | 'infeasible' | 'error'
  message: string
  diagnostics: string[]
  artifact: GeneratedSolverArtifact | null
  runOutput: SolverExecutionOutput | null
  verification: VerifierAssessment | null
  telemetry: PipelineTelemetry
}): TimetableSolveResult {
  return {
    status: params.status,
    message: params.message,
    diagnostics: params.diagnostics,
    cells: params.runOutput?.cells ?? [],
    compiledConstraints: params.artifact ? [toArtifactSummary(params.artifact)] : [],
    unparsedConstraints: [],
    executionErrors: params.runOutput?.executionErrors ?? [],
    validationErrors: params.runOutput?.validationErrors ?? [],
    iisConstraintIds: params.runOutput?.iisConstraintIds ?? [],
    violations: params.runOutput?.violations ?? [],
    overallAssessment: params.verification?.rationale ?? null,
    solverStats: params.runOutput?.solverStats ?? null,
    modelRequestPreview: null,
    telemetry: params.telemetry,
  }
}

export async function runAgenticLoop(
  payload: InputPayload,
  apiKey: string,
  model: string,
  emit?: (event: AgentEvent) => void,
): Promise<TimetableSolveResult> {
  const MAX_ATTEMPTS = 4
  const startedAt = Date.now()
  const counters: RuntimeCounters = {
    generationAttempts: 0,
    verificationAttempts: 0,
    solverAttempts: 0,
    llmCallCount: 0,
    charsIn: 0,
    charsOut: 0,
  }

  const preprocess = preprocessInputPayload(payload)
  if (!preprocess.ok) {
    return createResult({
      status: 'error',
      message: 'Dữ liệu đầu vào không hợp lệ.',
      diagnostics: [...preprocess.diagnostics, ...preprocess.fatalErrors],
      artifact: null,
      runOutput: null,
      verification: null,
      telemetry: buildTelemetry(startedAt, counters, true),
    })
  }

  const normalizedPayload = preprocess.normalizedPayload
  const diagnostics = [...preprocess.diagnostics, ...preprocess.warnings.map((warning) => `${warning.code}: ${warning.message}`)]
  const baseSolverCode = preprocess.authoringContext.baseTemplateCode

  let previousArtifact: GeneratedSolverArtifact | null = null
  let previousRun: SolverExecutionOutput | null = null
  let previousVerification: VerifierAssessment | null = null
  let bestAttempt: {
    artifact: GeneratedSolverArtifact
    runOutput: SolverExecutionOutput
    verification: VerifierAssessment
  } | null = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    emit?.({ type: 'status', message: attempt === 1 ? 'Agent 1 đang viết solver...' : `Agent 1 đang sửa solver... (${attempt}/${MAX_ATTEMPTS})`, iteration: attempt, maxIterations: MAX_ATTEMPTS })

    const artifact = await generateSolverArtifact({
      payload: normalizedPayload,
      apiKey,
      model,
      baseSolverCode,
      previousArtifact,
      previousRun,
      previousVerification,
      attempt,
      maxAttempts: MAX_ATTEMPTS,
      counters,
    })

    emit?.({ type: 'status', message: 'Đang chạy solver generated...', iteration: attempt, maxIterations: MAX_ATTEMPTS })
    counters.solverAttempts += 1
    const solverResult = await runSolverDirect({
      problem: toSolverProblem(normalizedPayload),
      solverArtifactPath: artifact.path,
      entrypoint: artifact.entrypoint,
    })

    if (!solverResult.success) {
      previousArtifact = artifact
      previousRun = {
        status: 'error',
        message: solverResult.error,
        diagnostics: [solverResult.error],
        cells: [],
        iisConstraintIds: [],
        executionErrors: [],
        validationErrors: [],
        violations: [],
        solverStats: null,
        artifactPath: artifact.path,
        loadError: solverResult.error,
        runtimeError: solverResult.error,
      }
      previousVerification = {
        verdict: 'retryable',
        confidence: 1,
        rationale: 'Runner không chạy được solver generated.',
        unmetRequirements: [solverResult.error],
        repairInstructions: ['Sửa lỗi import/runtime để solver generated chạy được.'],
        confidentlyInfeasible: false,
      }
      emit?.({ type: 'code_fix', attempt, error: solverResult.error })
      continue
    }

    const runOutput = solverResult.data
    emit?.({ type: 'status', message: 'Agent 2 đang verify output...', iteration: attempt, maxIterations: MAX_ATTEMPTS })
    const verification = await verifySolverOutput({
      payload: normalizedPayload,
      artifact,
      runOutput,
      apiKey,
      model,
      counters,
    })

    emit?.({ type: 'verified', violations: runOutput.violations ?? [], allSatisfied: verification.verdict === 'solved' })

    previousArtifact = artifact
    previousRun = runOutput
    previousVerification = verification

    bestAttempt = {
      artifact,
      runOutput,
      verification,
    }

    if (verification.verdict === 'solved') {
      return createResult({
        status: 'solved',
        message: runOutput.message || 'Đã tạo thời khóa biểu hợp lệ.',
        diagnostics: [...diagnostics, verification.rationale],
        artifact,
        runOutput,
        verification,
        telemetry: buildTelemetry(startedAt, counters, false),
      })
    }

    if (verification.verdict === 'infeasible' && verification.confidentlyInfeasible) {
      return createResult({
        status: 'infeasible',
        message: runOutput.message || 'Không thể tạo thời khóa biểu với các ràng buộc hiện tại.',
        diagnostics: [...diagnostics, verification.rationale, ...verification.unmetRequirements],
        artifact,
        runOutput,
        verification,
        telemetry: buildTelemetry(startedAt, counters, false),
      })
    }

    emit?.({ type: 'code_fix', attempt, error: verification.repairInstructions.join('\n') || verification.rationale })
  }

  if (bestAttempt) {
    return createResult({
      status: bestAttempt.verification.verdict === 'infeasible' ? 'infeasible' : 'error',
      message: bestAttempt.verification.rationale || bestAttempt.runOutput.message || 'Không thể hội tụ lời giải hợp lệ.',
      diagnostics: [...diagnostics, ...bestAttempt.verification.unmetRequirements],
      artifact: bestAttempt.artifact,
      runOutput: bestAttempt.runOutput,
      verification: bestAttempt.verification,
      telemetry: buildTelemetry(startedAt, counters, false),
    })
  }

  return createResult({
    status: 'error',
    message: 'Không thể tạo thời khóa biểu sau nhiều lần thử.',
    diagnostics,
    artifact: null,
    runOutput: null,
    verification: null,
    telemetry: buildTelemetry(startedAt, counters, false),
  })
}
