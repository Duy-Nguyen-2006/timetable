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
import { runDeterministicChecks } from '@/lib/deterministic-checker'
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

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fenced?.[1]?.trim() ?? trimmed
  if (candidate.startsWith('{') && candidate.endsWith('}')) return candidate

  const firstBrace = candidate.indexOf('{')
  const lastBrace = candidate.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1)
  }

  return null
}

function createBaseFallbackSolverCode(_baseSolverCode: string) {
  // Delegate to the canonical template_solver so common Vietnamese constraint
  // patterns still apply even when the LLM-generated artifact is invalid.
  return [
    'from timetable_solver.template_solver import solve_timetable',
    '',
    '__all__ = ["solve_timetable"]',
    '',
  ].join('\n')
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
    const jsonText = extractJsonObject(raw)
    if (!jsonText) return fallback
    const parsed = JSON.parse(jsonText) as Partial<VerifierAssessment>
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
    solverCode: createBaseFallbackSolverCode(baseSolverCode),
    entrypoint: 'solve_timetable',
    summary: 'Fallback to base solver template due to invalid author response.',
    assumptions: ['Agent 1 did not return valid JSON'],
  }

  try {
    const jsonText = extractJsonObject(raw)
    if (!jsonText) return fallback
    const parsed = JSON.parse(jsonText) as Partial<SolverAuthorResponse>
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

function groupBy<T>(items: T[], key: (item: T) => string, value: (item: T) => string): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const item of items) {
    const k = key(item)
    if (!map[k]) map[k] = []
    map[k].push(value(item))
  }
  return map
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
    hardConstraints: payload.hardConstraints,
    softConstraints: payload.softConstraints,
    solverConfig: {
      maxTimeSeconds: payload.slots.length * payload.assignments.length > 1500 ? 25 : 15,
      numWorkers: payload.slots.length * payload.assignments.length > 2500 ? 3 : 2,
      randomSeed: 1,
    },
    // Pre-computed lookup maps so generated Python code doesn't need to parse labels.
    // Keys are human-readable labels (e.g. "Sơn", "monday", "6A").
    meta: {
      teacherToAsgIds: groupBy(payload.assignments, (a) => a.teacherLabel, (a) => a.id),
      classToAsgIds: groupBy(payload.assignments, (a) => a.classLabel, (a) => a.id),
      subjectToAsgIds: groupBy(payload.assignments, (a) => a.subjectLabel, (a) => a.id),
      slotsByDayId: groupBy(payload.slots, (s) => s.dayId, (s) => s.id),
      slotsBySessionId: groupBy(payload.slots, (s) => s.sessionId, (s) => s.id),
      slotsByPeriod: groupBy(payload.slots, (s) => String(s.period), (s) => s.id),
      dayLabelToId: Object.fromEntries(payload.slots.map((s) => [s.dayLabel, s.dayId])),
      sessionLabelToId: Object.fromEntries(payload.slots.map((s) => [s.sessionLabel, s.sessionId])),
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
  requestId?: string
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
  }, input.requestId)
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
  payload?: InputPayload
}): TimetableSolveResult {
  const iisIds = params.runOutput?.iisConstraintIds ?? []
  const conflictingConstraints = iisIds.length > 0 && params.payload
    ? params.payload.hardConstraints.filter((c) => iisIds.includes(c.id))
    : []
  return {
    status: params.status,
    message: params.message,
    diagnostics: params.diagnostics,
    cells: params.runOutput?.cells ?? [],
    compiledConstraints: params.artifact ? [toArtifactSummary(params.artifact)] : [],
    unparsedConstraints: [],
    executionErrors: params.runOutput?.executionErrors ?? [],
    validationErrors: params.runOutput?.validationErrors ?? [],
    iisConstraintIds: iisIds,
    conflictingConstraints,
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
  requestId?: string,
): Promise<TimetableSolveResult> {
  // Coder retries Python errors up to MAX_CODER_INNER times per Checker cycle.
  // Checker feeds violations back to Coder up to MAX_OUTER times.
  const MAX_OUTER = 2
  const MAX_CODER_INNER = 3
  const MAX_ITERATIONS = MAX_OUTER * MAX_CODER_INNER

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
  const diagnostics = [...preprocess.diagnostics, ...preprocess.warnings.map((w) => `${w.code}: ${w.message}`)]
  const baseSolverCode = preprocess.authoringContext.baseTemplateCode

  const attemptDiagnostics: string[] = []
  let bestAttempt: {
    artifact: GeneratedSolverArtifact
    runOutput: SolverExecutionOutput
    verification: VerifierAssessment
  } | null = null

  // checkerFeedback carries Checker violations → Coder on next outer iteration
  let checkerFeedback: VerifierAssessment | null = null
  let globalIteration = 0

  for (let outerAttempt = 1; outerAttempt <= MAX_OUTER; outerAttempt++) {
    // ── CODER SUB-LOOP ────────────────────────────────────────────────────────
    // Coder writes code, runs Python, self-repairs on runtime errors.
    // Exits when Python runs clean and output schema is valid.
    let coderSuccess: { artifact: GeneratedSolverArtifact; runOutput: SolverExecutionOutput } | null = null
    let prevArtifact: GeneratedSolverArtifact | null = null
    let prevRun: SolverExecutionOutput | null = null
    let prevFeedback: VerifierAssessment | null = checkerFeedback

    for (let coderAttempt = 1; coderAttempt <= MAX_CODER_INNER; coderAttempt++) {
      globalIteration++
      const label = globalIteration === 1
        ? 'Agent 1 (Coder) đang viết solver...'
        : `Agent 1 (Coder) đang sửa solver... (lần ${globalIteration}/${MAX_ITERATIONS})`
      emit?.({ type: 'status', message: label, iteration: globalIteration, maxIterations: MAX_ITERATIONS })

      let artifact: GeneratedSolverArtifact
      try {
        artifact = await generateSolverArtifact({
          payload: normalizedPayload,
          apiKey,
          model,
          baseSolverCode,
          previousArtifact: prevArtifact,
          previousRun: prevRun,
          previousVerification: prevFeedback,
          attempt: globalIteration,
          maxAttempts: MAX_ITERATIONS,
          counters,
          requestId,
        })
        attemptDiagnostics.push(`[${globalIteration}] Coder artifact: ${artifact.summary || artifact.entrypoint}`)
        emit?.({ type: 'debug', message: 'Coder tạo solver artifact.', detail: artifact.summary })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        attemptDiagnostics.push(`[${globalIteration}] Coder LLM lỗi: ${msg}`)
        prevFeedback = {
          verdict: 'retryable', confidence: 1,
          rationale: 'LLM call thất bại.',
          unmetRequirements: [msg],
          repairInstructions: ['Gọi lại với full solver code hợp lệ.'],
          confidentlyInfeasible: false,
        }
        emit?.({ type: 'code_fix', attempt: globalIteration, error: msg })
        continue
      }

      emit?.({ type: 'status', message: 'Đang chạy solver...', iteration: globalIteration, maxIterations: MAX_ITERATIONS })
      counters.solverAttempts++
      const solverResult = await runSolverDirect({
        problem: toSolverProblem(normalizedPayload),
        solverArtifactPath: artifact.path,
        entrypoint: artifact.entrypoint,
      })

      if (!solverResult.success) {
        const errMsg = solverResult.error
        attemptDiagnostics.push(`[${globalIteration}] Python lỗi: ${errMsg}`)
        emit?.({ type: 'debug', message: 'Python runner lỗi.', detail: errMsg })
        prevArtifact = artifact
        prevRun = {
          status: 'error', message: errMsg,
          diagnostics: [errMsg], cells: [],
          iisConstraintIds: [], executionErrors: [], validationErrors: [], violations: [],
          solverStats: null, artifactPath: artifact.path,
          loadError: errMsg, runtimeError: errMsg,
        }
        prevFeedback = {
          verdict: 'retryable', confidence: 1,
          rationale: 'Python runtime lỗi — sửa code.',
          unmetRequirements: [errMsg],
          repairInstructions: ['Sửa lỗi import/syntax/runtime trong solver code.'],
          confidentlyInfeasible: false,
        }
        emit?.({ type: 'code_fix', attempt: globalIteration, error: errMsg })
        continue
      }

      const runOutput = solverResult.data

      if (!Array.isArray(runOutput.cells)) {
        const schemaErr = 'Output thiếu trường cells array — schema không hợp lệ.'
        attemptDiagnostics.push(`[${globalIteration}] Schema lỗi: ${schemaErr}`)
        prevArtifact = artifact
        prevRun = runOutput
        prevFeedback = {
          verdict: 'retryable', confidence: 1,
          rationale: schemaErr,
          unmetRequirements: [schemaErr],
          repairInstructions: ['Trả đúng schema: {status, message, diagnostics, cells, iisConstraintIds, executionErrors, validationErrors, violations, solverStats}.'],
          confidentlyInfeasible: false,
        }
        emit?.({ type: 'code_fix', attempt: globalIteration, error: schemaErr })
        continue
      }

      attemptDiagnostics.push(`[${globalIteration}] Coder OK: status=${runOutput.status}, cells=${runOutput.cells.length}`)
      coderSuccess = { artifact, runOutput }
      break
    }

    if (!coderSuccess) {
      // Fallback: run the canonical template_solver directly. Covers the case
      // where the LLM keeps emitting buggy Python — common Vietnamese constraint
      // patterns are still applied so the user gets a valid schedule.
      attemptDiagnostics.push(`[${globalIteration}] Fallback: chạy template_solver mặc định.`)
      emit?.({ type: 'status', message: 'Chạy solver mặc định (template fallback)...', iteration: globalIteration, maxIterations: MAX_ITERATIONS })
      const fallbackCode = createBaseFallbackSolverCode(baseSolverCode)
      const fallbackArtifact = persistGeneratedSolverArtifact({
        solverCode: fallbackCode,
        entrypoint: 'solve_timetable',
        summary: 'Template fallback (canonical solver) — LLM artifact invalid.',
        assumptions: ['Coder LLM failed; using deterministic template_solver.'],
      }, requestId)
      counters.solverAttempts++
      const fallbackResult = await runSolverDirect({
        problem: toSolverProblem(normalizedPayload),
        solverArtifactPath: fallbackArtifact.path,
        entrypoint: fallbackArtifact.entrypoint,
      })

      if (fallbackResult.success && Array.isArray(fallbackResult.data.cells)) {
        attemptDiagnostics.push(`[${globalIteration}] Fallback OK: status=${fallbackResult.data.status}, cells=${fallbackResult.data.cells.length}`)
        coderSuccess = { artifact: fallbackArtifact, runOutput: fallbackResult.data }
      } else {
        const errMsg = 'Coder không tạo được solver hợp lệ sau nhiều lần thử, fallback cũng lỗi.'
        const fbErr = fallbackResult.success ? 'Fallback output schema không hợp lệ.' : fallbackResult.error
        attemptDiagnostics.push(`[${globalIteration}] Fallback lỗi: ${fbErr}`)
        if (bestAttempt) {
          return createResult({
            status: 'error', message: errMsg,
            diagnostics: [...diagnostics, ...attemptDiagnostics, ...bestAttempt.verification.unmetRequirements],
            artifact: bestAttempt.artifact, runOutput: bestAttempt.runOutput,
            verification: bestAttempt.verification,
            telemetry: buildTelemetry(startedAt, counters, false),
            payload: normalizedPayload,
          })
        }
        return createResult({
          status: 'error', message: errMsg,
          diagnostics: [...diagnostics, ...attemptDiagnostics],
          artifact: null, runOutput: null, verification: null,
          telemetry: buildTelemetry(startedAt, counters, false),
          payload: normalizedPayload,
        })
      }
    }

    // ── CHECKER ───────────────────────────────────────────────────────────────
    // Phase 4: run deterministic pre-check before calling LLM Checker.
    const { artifact, runOutput } = coderSuccess
    emit?.({ type: 'status', message: 'Agent 2 (Checker) đang kiểm tra kết quả...', iteration: globalIteration, maxIterations: MAX_ITERATIONS })

    let verification: VerifierAssessment

    const hasCells = Array.isArray(runOutput.cells) && runOutput.cells.length > 0
    const detCheck = hasCells && runOutput.status !== 'infeasible'
      ? runDeterministicChecks(normalizedPayload.hardConstraints, normalizedPayload.assignments, runOutput.cells)
      : null

    if (detCheck && detCheck.violations.length > 0) {
      // Hard violations found deterministically — skip LLM, feed directly to Coder
      const msg = `Phát hiện ${detCheck.violations.length} vi phạm ràng buộc cứng (kiểm tra tự động).`
      attemptDiagnostics.push(`[outer ${outerAttempt}] Det-check: ${msg}`)
      verification = {
        verdict: 'retryable',
        confidence: 1,
        rationale: msg,
        unmetRequirements: detCheck.violations.map((v) => v.evidence),
        repairInstructions: detCheck.violations.map((v) => v.repair),
        confidentlyInfeasible: false,
      }
    } else if (detCheck && detCheck.allChecked && normalizedPayload.softConstraints.length === 0) {
      // All hard constraints parsed and satisfied, no soft constraints → solved
      const msg = 'Tất cả ràng buộc cứng đã được xác minh tự động.'
      attemptDiagnostics.push(`[outer ${outerAttempt}] Det-check: ${msg}`)
      verification = {
        verdict: 'solved',
        confidence: 1,
        rationale: msg,
        unmetRequirements: [],
        repairInstructions: [],
        confidentlyInfeasible: false,
      }
    } else {
      // Some constraints unparseable or have soft constraints → call LLM Checker
      try {
        verification = await verifySolverOutput({
          payload: normalizedPayload,
          artifact,
          runOutput,
          apiKey,
          model,
          counters,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        attemptDiagnostics.push(`[outer ${outerAttempt}] Checker lỗi: ${msg}`)
        // If deterministic check already cleared all hard constraints (or found
        // no violations), don't block on LLM Checker — accept as solved.
        // Soft constraint scoring is best-effort; missing it is not fatal.
        const detCleared = detCheck !== null && detCheck.violations.length === 0
        if (detCleared && runOutput.status !== 'infeasible') {
          const note = detCheck.allChecked
            ? 'Tất cả ràng buộc cứng đã xác minh tự động (Checker LLM không khả dụng).'
            : 'Không phát hiện vi phạm ràng buộc cứng (Checker LLM không khả dụng).'
          verification = {
            verdict: 'solved', confidence: 0.8,
            rationale: note,
            unmetRequirements: [],
            repairInstructions: [],
            confidentlyInfeasible: false,
          }
        } else {
          verification = {
            verdict: 'retryable', confidence: 1,
            rationale: 'Checker LLM call thất bại.',
            unmetRequirements: [msg],
            repairInstructions: ['Chạy lại với output rõ ràng hơn.'],
            confidentlyInfeasible: false,
          }
        }
      }
    }

    attemptDiagnostics.push(`[outer ${outerAttempt}] Checker verdict=${verification.verdict}: ${verification.rationale}`)
    emit?.({ type: 'debug', message: `status=${runOutput.status}; checker=${verification.verdict}`, detail: verification.rationale })
    emit?.({ type: 'verified', violations: runOutput.violations ?? [], allSatisfied: verification.verdict === 'solved' })

    bestAttempt = { artifact, runOutput, verification }

    if (verification.verdict === 'solved') {
      return createResult({
        status: 'solved',
        message: runOutput.message || 'Đã tạo thời khóa biểu hợp lệ.',
        diagnostics: [...diagnostics, verification.rationale],
        artifact, runOutput, verification,
        telemetry: buildTelemetry(startedAt, counters, false),
        payload: normalizedPayload,
      })
    }

    if (verification.verdict === 'infeasible' && verification.confidentlyInfeasible) {
      return createResult({
        status: 'infeasible',
        message: runOutput.message || 'Không thể tạo thời khóa biểu với các ràng buộc hiện tại.',
        diagnostics: [...diagnostics, verification.rationale, ...verification.unmetRequirements],
        artifact, runOutput, verification,
        telemetry: buildTelemetry(startedAt, counters, false),
        payload: normalizedPayload,
      })
    }

    // Feed Checker violations → Coder on next outer iteration
    checkerFeedback = verification
    emit?.({ type: 'code_fix', attempt: globalIteration, error: verification.repairInstructions.join('\n') || verification.rationale })
  }

  if (bestAttempt) {
    return createResult({
      status: bestAttempt.verification.verdict === 'infeasible' ? 'infeasible' : 'error',
      message: bestAttempt.verification.rationale || bestAttempt.runOutput.message || 'Không thể hội tụ lời giải hợp lệ.',
      diagnostics: [...diagnostics, ...attemptDiagnostics, ...bestAttempt.verification.unmetRequirements],
      artifact: bestAttempt.artifact, runOutput: bestAttempt.runOutput,
      verification: bestAttempt.verification,
      telemetry: buildTelemetry(startedAt, counters, false),
      payload: normalizedPayload,
    })
  }

  return createResult({
    status: 'error',
    message: 'Không thể tạo thời khóa biểu sau nhiều lần thử.',
    diagnostics: [...diagnostics, ...attemptDiagnostics],
    artifact: null, runOutput: null, verification: null,
    telemetry: buildTelemetry(startedAt, counters, false),
    payload: normalizedPayload,
  })
}
