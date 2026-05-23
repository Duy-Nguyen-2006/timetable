import { NextResponse } from 'next/server'

import type {
  TimetableSolveResult,
  ConstraintViolation,
} from '@/features/timetable/ai/types'
import { db } from '@/lib/db'
import { chatCompletion, detectModel } from '@/lib/llm-client'
import { runSolverDirect } from '@/lib/sandbox'
import { buildInputPayload, CONSTRAINT_COMPILER_PROMPT, VIOLATION_ENRICH_PROMPT, buildCompilerUserMessage, toSolverProblem, type InputPayload } from '@/lib/timetable-prompt'

// ---------------------------------------------------------------------------
// SSE streaming helpers
// ---------------------------------------------------------------------------

type AgentEvent =
  | { type: 'status'; message: string; iteration: number; maxIterations: number }
  | { type: 'code_fix'; attempt: number; error: string }
  | { type: 'verified'; violations: ConstraintViolation[]; allSatisfied: boolean }
  | { type: 'result'; data: TimetableSolveResult }
  | { type: 'error'; message: string }

function createSSEStream() {
  const encoder = new TextEncoder()
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null

  const stream = new ReadableStream<Uint8Array>({
    start(c) { controller = c },
  })

  function send(event: AgentEvent) {
    if (!controller) return
    const data = JSON.stringify(event)
    controller.enqueue(encoder.encode(`data: ${data}\n\n`))
  }

  function close() {
    if (!controller) return
    controller.enqueue(encoder.encode('data: [DONE]\n\n'))
    controller.close()
  }

  return { stream, send, close }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const acceptSSE = request.headers.get('accept')?.includes('text/event-stream')

  try {
    const input = await request.json()

    // 1. Resolve API key
    const apiKeyFromBody = typeof input?.apiKey === 'string' ? input.apiKey.trim() : ''
    let apiKey = apiKeyFromBody || request.headers.get('x-lowprizo-api-key')?.trim() || ''
    if (!apiKey) {
      const record = await db.apiKey.findFirst({ orderBy: { createdAt: 'desc' } })
      apiKey = record?.key ?? ''
    }
    if (!apiKey) {
      return NextResponse.json({ error: 'Vui lòng nhập Lowprizo API key.' }, { status: 400 })
    }

    // 2. Detect model
    const model = await detectModel(apiKey)

    // 3. Build payload
    const payload = buildInputPayload(input)

    // --- Non-streaming path (backward compat) ---
    if (!acceptSSE) {
      const result = await runAgenticLoop(payload, apiKey, model)
      return NextResponse.json(result)
    }

    // --- Streaming path ---
    const { stream, send, close } = createSSEStream()

    // Run agent in background
    runAgenticLoop(payload, apiKey, model, send).then((result) => {
      send({ type: 'result', data: result })
      close()
    }).catch((err) => {
      send({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
      close()
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể tạo thời khóa biểu.'
    console.error('[generate-timetable] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Constraint Compiler
// ---------------------------------------------------------------------------

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
    } catch { /* fall through */ }
    return null
  }
  return (
    tryParse(text) ??
    (() => { const m = text.match(/\[[\s\S]*\]/); return m ? tryParse(m[0]) : null })()
  )
}

async function compileConstraints(
  payload: InputPayload,
  apiKey: string,
  model: string,
): Promise<CompiledConstraintFull[]> {
  if (payload.hardConstraints.length === 0 && payload.softConstraints.length === 0) {
    return []
  }

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: CONSTRAINT_COMPILER_PROMPT },
    { role: 'user', content: buildCompilerUserMessage(payload) },
  ]

  for (let attempt = 0; attempt < 3; attempt++) {
    const responseText = await chatCompletion(messages, apiKey, model)
    const constraints = parseCompiledConstraints(responseText)
    if (constraints && constraints.length > 0) return constraints
    messages.push({ role: 'assistant', content: responseText })
    messages.push({
      role: 'user',
      content: 'Output phải là JSON array. Trả lại JSON array thuần, không có markdown hay giải thích.',
    })
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
): Promise<CompiledConstraintFull[]> {
  if (failedIds.length === 0) return currentConstraints

  const failedConstraints = currentConstraints.filter(c => failedIds.includes(c.id))
  const okConstraints = currentConstraints.filter(c => !failedIds.includes(c.id))

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: CONSTRAINT_COMPILER_PROMPT },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'Sửa các constraint sau bị lỗi. Giữ nguyên id. Chỉ trả JSON array cho các constraint cần sửa.',
        errors,
        constraintsToFix: failedConstraints,
        context: JSON.parse(buildCompilerUserMessage(payload)).context,
      }),
    },
  ]

  for (let attempt = 0; attempt < 2; attempt++) {
    const responseText = await chatCompletion(messages, apiKey, model)
    const fixed = parseCompiledConstraints(responseText)
    if (fixed && fixed.length > 0) {
      const fixedMap = new Map(fixed.map(c => [c.id, c]))
      return [
        ...okConstraints,
        ...failedConstraints.map(c => fixedMap.get(c.id) ?? c),
      ]
    }
    messages.push({ role: 'assistant', content: responseText })
    messages.push({ role: 'user', content: 'Trả JSON array thuần.' })
  }
  return currentConstraints
}

// ---------------------------------------------------------------------------
// Violation enrichment (conflictsWith + suggestion)
// ---------------------------------------------------------------------------

async function enrichViolations(
  payload: InputPayload,
  violations: ConstraintViolation[],
  apiKey: string,
  model: string,
): Promise<ConstraintViolation[]> {
  if (violations.length === 0) return violations

  const allConstraints = [
    ...payload.hardConstraints.map((c) => ({ id: c.id, text: c.text, priority: 'hard' as const })),
    ...payload.softConstraints.map((c) => ({ id: c.id, text: c.text, priority: 'soft' as const })),
  ]

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: VIOLATION_ENRICH_PROMPT },
    {
      role: 'user',
      content: JSON.stringify({
        allConstraints,
        violations: violations.map((v) => ({
          constraintId: v.constraintId,
          original: v.original,
          violated: v.violated,
          reason: v.reason,
        })),
      }),
    },
  ]

  try {
    const responseText = await chatCompletion(messages, apiKey, model)
    const tryParse = (raw: string) => {
      try {
        const p = JSON.parse(raw)
        return Array.isArray(p) ? p : null
      } catch { return null }
    }
    const parsed = tryParse(responseText)
      ?? (() => { const m = responseText.match(/\[[\s\S]*\]/); return m ? tryParse(m[0]) : null })()
    if (!parsed) return violations

    const byId = new Map<string, { conflictsWith?: string; suggestion?: string }>()
    for (const entry of parsed as Array<Record<string, unknown>>) {
      const id = String(entry.constraintId ?? '')
      if (!id) continue
      byId.set(id, {
        conflictsWith: typeof entry.conflictsWith === 'string' ? entry.conflictsWith : undefined,
        suggestion: typeof entry.suggestion === 'string' ? entry.suggestion : undefined,
      })
    }

    return violations.map((v) => {
      const extra = byId.get(v.constraintId)
      if (!extra) return v
      return { ...v, conflictsWith: extra.conflictsWith ?? v.conflictsWith, suggestion: extra.suggestion ?? v.suggestion }
    })
  } catch (err) {
    console.warn('[enrichViolations] failed:', err instanceof Error ? err.message : err)
    return violations
  }
}

function toAICompiledConstraints(constraints: CompiledConstraintFull[]) {
  return constraints.map(c => ({
    id: c.id,
    description: c.description,
    original: c.original,
    priority: c.priority,
    weight: c.weight,
    code: c.code,
    checkerCode: c.checkerCode,
  }))
}

// ---------------------------------------------------------------------------
// Agentic Loop
// ---------------------------------------------------------------------------

async function runAgenticLoop(
  payload: InputPayload,
  apiKey: string,
  model: string,
  emit?: (event: AgentEvent) => void,
): Promise<TimetableSolveResult> {
  const MAX_ATTEMPTS = 4

  emit?.({ type: 'status', message: 'Đang biên dịch ràng buộc...', iteration: 1, maxIterations: MAX_ATTEMPTS })

  let compiledConstraints = await compileConstraints(payload, apiKey, model)

  let bestResult: TimetableSolveResult | null = null
  let bestViolationCount = Infinity

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    emit?.({
      type: 'status',
      message: attempt === 0 ? 'Đang tạo thời khóa biểu...' : `Đang thử lại... (${attempt + 1}/${MAX_ATTEMPTS})`,
      iteration: attempt + 1,
      maxIterations: MAX_ATTEMPTS,
    })

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

    // Handle execution errors in constraint snippets
    if (data.executionErrors && data.executionErrors.length > 0) {
      const errorIds = data.executionErrors.map(e => e.constraintId)
      const errorSummary = data.executionErrors.map(e => `[${e.constraintId}] ${e.error}`).join('\n')
      emit?.({ type: 'code_fix', attempt: attempt + 1, error: `Lỗi constraint code: ${errorSummary}` })
      if (attempt < MAX_ATTEMPTS - 1) {
        compiledConstraints = await recompileConstraints(payload, compiledConstraints, errorIds, errorSummary, apiKey, model)
        continue
      }
    }

    // Handle infeasible
    if (data.status === 'infeasible') {
      const iisIds = data.iisConstraintIds ?? []
      const iisInfo = iisIds.length > 0
        ? `Constraints gây mâu thuẫn: ${iisIds.join(', ')}`
        : 'Không xác định được constraint nào gây mâu thuẫn — có thể base constraints quá chặt với lịch này.'

      emit?.({ type: 'code_fix', attempt: attempt + 1, error: `Solver INFEASIBLE. ${iisInfo}` })

      if (attempt < MAX_ATTEMPTS - 1 && iisIds.length > 0) {
        const errorSummary = `Infeasible vì constraint quá chặt: ${iisIds.join(', ')}`
        compiledConstraints = await recompileConstraints(payload, compiledConstraints, iisIds, errorSummary, apiKey, model)
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
      }
    }

    if (data.status !== 'solved') continue

    const cells = data.cells
    const violations: ConstraintViolation[] = data.violations ?? []
    const hardViolationCount = violations.filter(v => v.violated).length
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
      console.log('[agent] All constraints satisfied at attempt', attempt + 1)
      bestResult!.diagnostics = [`Tất cả ràng buộc thỏa mãn sau ${attempt + 1} lần thử.`]
      return bestResult!
    }

    // Retry when checker found hard violations (constraint code has wrong logic)
    if (attempt < MAX_ATTEMPTS - 1 && hardViolationCount > 0) {
      const violatedIds = violations
        .filter(v => v.violated)
        .map(v => v.constraintId)
        .filter(id => id.startsWith('hc_') || id.startsWith('sc_'))
      if (violatedIds.length > 0) {
        const errorSummary = violations
          .filter(v => v.violated)
          .map(v => `[${v.constraintId}] "${v.original}" bị vi phạm: ${v.reason}`)
          .join('\n')
        compiledConstraints = await recompileConstraints(payload, compiledConstraints, violatedIds, errorSummary, apiKey, model)
      }
    }
  }

  if (bestResult) {
    const hardCount = bestResult.violations.filter(v => v.violated).length
    const softCount = bestResult.violations.filter(v => !v.violated).length
    if (hardCount > 0) {
      bestResult.message = `Còn ${hardCount} ràng buộc cứng bị vi phạm sau ${MAX_ATTEMPTS} lần thử.`
    } else if (softCount > 0) {
      bestResult.message = `${softCount} ràng buộc mềm chưa đạt tối ưu.`
    } else {
      bestResult.message = 'Tất cả ràng buộc thỏa mãn.'
    }
    if (bestResult.violations.length > 0) {
      bestResult.violations = await enrichViolations(payload, bestResult.violations, apiKey, model)
    }
    return bestResult
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
  }
}
