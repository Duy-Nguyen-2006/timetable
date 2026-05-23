import type {
  TimetableSolveResult,
  ConstraintViolation,
  AgentEvent,
  PipelineTelemetry,
} from '@/features/timetable/ai/types'
import { chatCompletion } from '@/lib/llm-client'
import { runSolverDirect } from '@/lib/sandbox'
import {
  CONSTRAINT_COMPILER_PROMPT,
  buildCompilerUserMessage,
  toSolverProblem,
  type InputPayload,
} from '@/lib/timetable-prompt'
import { buildIRDraftFromConstraints, reviewIRDraft } from '@/features/timetable/ai/ir'
import { compileIRToConstraints } from '@/lib/ir-compiler'

type CompiledConstraintFull = {
  id: string
  original: string
  description: string
  priority: 'hard' | 'soft'
  weight?: number
  code: string
  checkerCode?: string
}

function normalizeConstraint(c: Record<string, unknown>): CompiledConstraintFull {
  return {
    id: String(c.id ?? ''),
    original: String(c.original ?? ''),
    description: String(c.description ?? ''),
    priority: c.priority === 'soft' ? 'soft' : 'hard',
    weight: typeof c.weight === 'number' ? c.weight : undefined,
    code: String(c.code ?? ''),
    checkerCode: String(c.checker_code ?? c.checkerCode ?? ''),
  }
}

function parseCompiledConstraints(text: string): CompiledConstraintFull[] | null {
  const tryParse = (raw: string): CompiledConstraintFull[] | null => {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map(normalizeConstraint)
    } catch {
      // fall through
    }
    return null
  }

  return tryParse(text) ?? (() => {
    const m = text.match(/\[[\s\S]*\]/)
    return m ? tryParse(m[0]) : null
  })()
}

type AgentLoopOptions = {
  useIRPipeline?: boolean
  shadowMode?: boolean
}

type RuntimeCounters = {
  compileAttempts: number
  repairAttempts: number
  solverAttempts: number
  llmCallCount: number
  charsIn: number
  charsOut: number
}

function estimateTokenChars(messages: Array<{ content: string }>): number {
  return messages.reduce((sum, m) => sum + m.content.length, 0)
}

function precheckProblem(payload: InputPayload): { ok: boolean; reason?: string } {
  if (payload.slots.length === 0) return { ok: false, reason: 'Không có slot khả dụng.' }
  if (payload.assignments.length === 0) return { ok: false, reason: 'Không có phân công để xếp.' }

  // Validate per-class demand against per-class slot capacity.
  // Each class can only occupy one teacher/subject per slot, so the right
  // capacity baseline is slots per class (not global slots for all classes).
  const slotsPerClass = payload.slots.length
  const demandByClass = new Map<string, number>()

  for (const assignment of payload.assignments) {
    const className = String(assignment.className || '').trim()
    const periods = Number(assignment.weeklyPeriods || 0)
    if (!className) continue
    demandByClass.set(className, (demandByClass.get(className) ?? 0) + periods)
  }

  for (const [className, demand] of demandByClass.entries()) {
    if (demand > slotsPerClass) {
      return {
        ok: false,
        reason: `Lớp ${className} có tổng số tiết yêu cầu (${demand}) vượt số slot khả dụng (${slotsPerClass}).`,
      }
    }
  }

  return { ok: true }
}

async function compileConstraints(
  payload: InputPayload,
  apiKey: string,
  model: string,
  counters?: RuntimeCounters,
): Promise<CompiledConstraintFull[]> {
  if (payload.hardConstraints.length === 0 && payload.softConstraints.length === 0) {
    return []
  }

  const baseUserMessage = buildCompilerUserMessage(payload)

  for (let attempt = 0; attempt < 3; attempt++) {
    counters && (counters.compileAttempts += 1)
    const userInstruction = attempt === 0
      ? baseUserMessage
      : JSON.stringify({
          task: 'Sửa định dạng output',
          requirement: 'Trả JSON array thuần, không markdown, không giải thích.',
          previousError: 'Invalid JSON array output',
          input: JSON.parse(baseUserMessage),
        })

    const messages = [
      { role: 'system' as const, content: CONSTRAINT_COMPILER_PROMPT },
      { role: 'user' as const, content: userInstruction },
    ]
    counters && (counters.llmCallCount += 1)
    counters && (counters.charsIn += estimateTokenChars(messages))
    const responseText = await chatCompletion(messages, apiKey, model)
    counters && (counters.charsOut += responseText.length)

    const constraints = parseCompiledConstraints(responseText)
    if (constraints && constraints.length > 0) return constraints
  }

  return []
}

async function recompileConstraints(
  payload: InputPayload,
  currentConstraints: CompiledConstraintFull[],
  failedIds: string[],
  errors: string,
  apiKey: string,
  model: string,
  counters?: RuntimeCounters,
): Promise<CompiledConstraintFull[]> {
  if (failedIds.length === 0) return currentConstraints

  const failedConstraints = currentConstraints.filter((c) => failedIds.includes(c.id))
  const okConstraints = currentConstraints.filter((c) => !failedIds.includes(c.id))

  const focusTexts = [
    ...failedConstraints.map((c) => `${c.original}\n${c.description}`),
    errors,
  ]
  const compilerInput = JSON.parse(buildCompilerUserMessage(payload, {
    focusTexts,
    includeAllContext: false,
  })) as { context?: unknown }
  const repairPayload = {
    task: 'Sửa các constraint sau bị lỗi. Giữ nguyên id. Chỉ trả JSON array cho các constraint cần sửa.',
    errors,
    constraintsToFix: failedConstraints,
    context: compilerInput.context,
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    counters && (counters.repairAttempts += 1)
    const messages = [
      { role: 'system' as const, content: CONSTRAINT_COMPILER_PROMPT },
      {
        role: 'user' as const,
        content: JSON.stringify({
          ...repairPayload,
          requirement: 'Output phải là JSON array thuần.',
          previousError: attempt === 0 ? undefined : 'Invalid JSON array output',
        }),
      },
    ]
    counters && (counters.llmCallCount += 1)
    counters && (counters.charsIn += estimateTokenChars(messages))
    const responseText = await chatCompletion(messages, apiKey, model)
    counters && (counters.charsOut += responseText.length)

    const fixed = parseCompiledConstraints(responseText)
    if (fixed && fixed.length > 0) {
      const fixedMap = new Map(fixed.map((c) => [c.id, c]))
      return [
        ...okConstraints,
        ...failedConstraints.map((c) => fixedMap.get(c.id) ?? c),
      ]
    }
  }

  return currentConstraints
}

function toAICompiledConstraints(constraints: CompiledConstraintFull[]) {
  return constraints.map((c) => ({
    id: c.id,
    description: c.description,
    original: c.original,
    priority: c.priority,
    weight: c.weight,
    code: c.code,
    checkerCode: c.checkerCode,
  }))
}

export async function runAgenticLoop(
  payload: InputPayload,
  apiKey: string,
  model: string,
  emit?: (event: AgentEvent) => void,
  options?: AgentLoopOptions,
): Promise<TimetableSolveResult> {
  const MAX_ATTEMPTS = 4
  const startedAt = Date.now()
  const counters: RuntimeCounters = {
    compileAttempts: 0,
    repairAttempts: 0,
    solverAttempts: 0,
    llmCallCount: 0,
    charsIn: 0,
    charsOut: 0,
  }

  const precheck = precheckProblem(payload)
  if (!precheck.ok) {
    return {
      status: 'infeasible',
      message: 'Không thể tạo thời khóa biểu với dữ liệu đầu vào hiện tại.',
      diagnostics: [precheck.reason ?? 'Precheck failed.'],
      cells: [],
      compiledConstraints: [],
      unparsedConstraints: [],
      executionErrors: [],
      validationErrors: [],
      iisConstraintIds: [],
      violations: [],
      overallAssessment: null,
      solverStats: null,
      modelRequestPreview: null,
      telemetry: {
        totalDurationMs: Date.now() - startedAt,
        compileAttempts: 0,
        repairAttempts: 0,
        solverAttempts: 0,
        llmCallCount: 0,
        tokenEstimateCharsIn: 0,
        tokenEstimateCharsOut: 0,
        precheckRejected: true,
      },
    }
  }

  emit?.({ type: 'status', message: 'Đang biên dịch ràng buộc...', iteration: 1, maxIterations: MAX_ATTEMPTS })

  let compiledConstraints = options?.useIRPipeline
    ? (() => {
        const allConstraints = [
          ...payload.hardConstraints.map((c) => ({ ...c, type: 'required' as const })),
          ...payload.softConstraints.map((c) => ({ ...c, type: 'preferred' as const })),
        ]
        const draft = buildIRDraftFromConstraints(allConstraints)
        const reviewed = reviewIRDraft(draft)
        return compileIRToConstraints(reviewed.rules).map((c) => ({
          id: c.id,
          original: c.original,
          description: c.description,
          priority: c.priority,
          weight: c.weight,
          code: c.code,
          checkerCode: c.checkerCode,
        }))
      })()
    : await compileConstraints(payload, apiKey, model, counters)

  let bestResult: TimetableSolveResult | null = null
  let bestViolationCount = Infinity

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    emit?.({
      type: 'status',
      message: attempt === 0 ? 'Đang tạo thời khóa biểu...' : `Đang thử lại... (${attempt + 1}/${MAX_ATTEMPTS})`,
      iteration: attempt + 1,
      maxIterations: MAX_ATTEMPTS,
    })

    counters.solverAttempts += 1
    const solverProblem = toSolverProblem(payload, compiledConstraints)
    const solverResult = await runSolverDirect(solverProblem)

    if (!solverResult.success) {
      if (attempt < MAX_ATTEMPTS - 1) continue
      return {
        status: 'error',
        message: `Lỗi khi chạy solver: ${solverResult.error}`,
        diagnostics: [],
        cells: [],
        compiledConstraints: [],
        unparsedConstraints: [],
        executionErrors: [],
        validationErrors: [],
        iisConstraintIds: [],
        violations: [],
        overallAssessment: null,
        solverStats: null,
        modelRequestPreview: null,
      }
    }

    const data = solverResult.data

    if (data.executionErrors && data.executionErrors.length > 0) {
      const errorIds = data.executionErrors.map((e) => e.constraintId)
      const errorSummary = data.executionErrors.map((e) => `[${e.constraintId}] ${e.error}`).join('\n')
      emit?.({ type: 'code_fix', attempt: attempt + 1, error: `Lỗi constraint code: ${errorSummary}` })
      if (attempt < MAX_ATTEMPTS - 1) {
        compiledConstraints = await recompileConstraints(payload, compiledConstraints, errorIds, errorSummary, apiKey, model, counters)
        continue
      }
    }

    if (data.status === 'infeasible') {
      const iisIds = data.iisConstraintIds ?? []
      const iisInfo = iisIds.length > 0
        ? `Constraints gây mâu thuẫn: ${iisIds.join(', ')}`
        : 'Không xác định được constraint nào gây mâu thuẫn — có thể base constraints quá chặt với lịch này.'

      emit?.({ type: 'code_fix', attempt: attempt + 1, error: `Solver INFEASIBLE. ${iisInfo}` })

      if (attempt < MAX_ATTEMPTS - 1 && iisIds.length > 0) {
        const errorSummary = `Infeasible vì constraint quá chặt: ${iisIds.join(', ')}`
        compiledConstraints = await recompileConstraints(payload, compiledConstraints, iisIds, errorSummary, apiKey, model, counters)
        continue
      }

      return {
        status: 'infeasible',
        message: 'Không thể tạo thời khóa biểu với các ràng buộc hiện tại.',
        diagnostics: [iisInfo],
        cells: [],
        compiledConstraints: toAICompiledConstraints(compiledConstraints),
        unparsedConstraints: [],
        executionErrors: data.executionErrors ?? [],
        validationErrors: data.validationErrors ?? [],
        iisConstraintIds: iisIds,
        violations: [],
        overallAssessment: null,
        solverStats: data.solverStats,
        modelRequestPreview: null,
        telemetry: {
          totalDurationMs: Date.now() - startedAt,
          compileAttempts: counters.compileAttempts,
          repairAttempts: counters.repairAttempts,
          solverAttempts: counters.solverAttempts,
          llmCallCount: counters.llmCallCount,
          tokenEstimateCharsIn: counters.charsIn,
          tokenEstimateCharsOut: counters.charsOut,
          precheckRejected: false,
        },
      }
    }

    if (data.status !== 'solved') continue

    const cells = data.cells
    const violations: ConstraintViolation[] = data.violations ?? []
    const hardViolationCount = violations.filter((v) => v.violated).length
    const allSatisfied = hardViolationCount === 0

    emit?.({ type: 'verified', violations, allSatisfied })

    if (hardViolationCount < bestViolationCount) {
      bestViolationCount = hardViolationCount
      bestResult = {
        status: 'solved',
        message: '',
        diagnostics: [],
        cells,
        compiledConstraints: toAICompiledConstraints(compiledConstraints),
        unparsedConstraints: [],
        executionErrors: data.executionErrors ?? [],
        validationErrors: data.validationErrors ?? [],
        iisConstraintIds: [],
        violations,
        overallAssessment: null,
        solverStats: data.solverStats,
        modelRequestPreview: null,
      }
    }

    if (allSatisfied) {
      bestResult!.diagnostics = [`Tất cả ràng buộc thỏa mãn sau ${attempt + 1} lần thử.`]
      return bestResult!
    }

    if (attempt < MAX_ATTEMPTS - 1 && hardViolationCount > 0) {
      const violatedIds = violations
        .filter((v) => v.violated)
        .map((v) => v.constraintId)
        .filter((id) => id.startsWith('hc_') || id.startsWith('sc_'))
      if (violatedIds.length > 0) {
        const errorSummary = violations
          .filter((v) => v.violated)
          .map((v) => `[${v.constraintId}] "${v.original}" bị vi phạm: ${v.reason}`)
          .join('\n')
        compiledConstraints = await recompileConstraints(payload, compiledConstraints, violatedIds, errorSummary, apiKey, model, counters)
      }
    }
  }

  if (bestResult) {
    const hardCount = bestResult.violations.filter((v) => v.violated).length
    const softCount = bestResult.violations.filter((v) => !v.violated).length
    if (hardCount > 0) {
      bestResult.message = `Còn ${hardCount} ràng buộc cứng bị vi phạm sau ${MAX_ATTEMPTS} lần thử.`
    } else if (softCount > 0) {
      bestResult.message = `${softCount} ràng buộc mềm chưa đạt tối ưu.`
    } else {
      bestResult.message = 'Tất cả ràng buộc thỏa mãn.'
    }
    const telemetry: PipelineTelemetry = {
      totalDurationMs: Date.now() - startedAt,
      compileAttempts: counters.compileAttempts,
      repairAttempts: counters.repairAttempts,
      solverAttempts: counters.solverAttempts,
      llmCallCount: counters.llmCallCount,
      tokenEstimateCharsIn: counters.charsIn,
      tokenEstimateCharsOut: counters.charsOut,
      precheckRejected: false,
    }
    return { ...bestResult, telemetry }
  }

  return {
    status: 'error',
    message: `Không thể tạo thời khóa biểu sau ${MAX_ATTEMPTS} lần thử.`,
    diagnostics: [],
    cells: [],
    compiledConstraints: [],
    unparsedConstraints: [],
    executionErrors: [],
    validationErrors: [],
    iisConstraintIds: [],
    violations: [],
    overallAssessment: null,
    solverStats: null,
    modelRequestPreview: null,
    telemetry: {
      totalDurationMs: Date.now() - startedAt,
      compileAttempts: counters.compileAttempts,
      repairAttempts: counters.repairAttempts,
      solverAttempts: counters.solverAttempts,
      llmCallCount: counters.llmCallCount,
      tokenEstimateCharsIn: counters.charsIn,
      tokenEstimateCharsOut: counters.charsOut,
      precheckRejected: false,
    },
  }
}
