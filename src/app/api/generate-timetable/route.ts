import { NextResponse } from 'next/server'

import type {
  TimetableSolveCell,
  TimetableSolveResult,
  ConstraintViolation,
} from '@/features/timetable/ai/types'
import { db } from '@/lib/db'
import { chatCompletion, detectModel } from '@/lib/llm-client'
import { runSolverDirect } from '@/lib/sandbox'
import { buildInputPayload, CONSTRAINT_COMPILER_PROMPT, buildCompilerUserMessage, toSolverProblem, type InputPayload } from '@/lib/timetable-prompt'

// ---------------------------------------------------------------------------
// Judge prompt
// ---------------------------------------------------------------------------

const JUDGE_SYSTEM_PROMPT = `[ROLE]
Bạn là Judge kiểm tra thời khóa biểu. Bạn nhận:
1. Danh sách ràng buộc gốc (tiếng Việt) của user
2. Kết quả thời khóa biểu (cells: mỗi cell có slotId, dayId, sessionId, period, entries)

[QUY ƯỚC NGÀY VIỆT NAM — RẤT QUAN TRỌNG]:
- Thứ 2 (Thứ Hai) = dayId "monday"
- Thứ 3 (Thứ Ba) = dayId "tuesday"
- Thứ 4 (Thứ Tư) = dayId "wednesday"
- Thứ 5 (Thứ Năm) = dayId "thursday"
- Thứ 6 (Thứ Sáu) = dayId "friday"
- Thứ 7 (Thứ Bảy) = dayId "saturday"
- Chủ nhật = dayId "sunday"
Khi constraint nói "thứ 2" → kiểm tra dayId "monday", KHÔNG PHẢI "tuesday".

[NHIỆM VỤ]
Kiểm tra TỪNG ràng buộc một cách kỹ lưỡng:
- Liệt kê từng constraint
- Tìm evidence cụ thể trong cells (trích dẫn slot, teacher, subject, class)
- Phán xét violated hay không

[QUY TẮC]
- Hard constraint bị vi phạm → violated: true
- Soft constraint không đạt → violated: false (chỉ note trong reason)
- Phải trích dẫn evidence cụ thể (slot nào, teacher nào, class nào)
- Confidence >= 0.8 mới flag violated
- Kiểm tra CẢ base constraints ngầm định:
  * Mỗi assignment có đúng weeklyPeriods slot
  * Giáo viên không trùng giờ
  * Lớp không trùng giờ

[OUTPUT - JSON thuần, không markdown]
{
  "violations": [
    {
      "constraintId": "hc_1",
      "original": "text ràng buộc gốc",
      "violated": true,
      "reason": "Evidence cụ thể...",
      "confidence": 0.95
    }
  ],
  "allSatisfied": true/false,
  "overallAssessment": "Tóm tắt 1-2 câu tiếng Việt"
}`

function buildJudgeUserPrompt(
  payload: InputPayload,
  cells: TimetableSolveCell[],
): string {
  // Build a readable timetable for the judge
  const timetableReadable = cells.map(cell => ({
    slot: `${cell.dayId}-${cell.sessionId}-tiết${cell.period}`,
    slotId: cell.slotId,
    entries: cell.entries.map(e => `${e.teacher} dạy ${e.subject} lớp ${e.className}`),
  }))

  return JSON.stringify({
    constraints: {
      hard: payload.hardConstraints,
      soft: payload.softConstraints,
    },
    assignments: payload.assignments.map(a => ({
      id: a.id,
      teacher: a.teacherLabel,
      subject: a.subjectLabel,
      class: a.classLabel,
      weeklyPeriods: a.weeklyPeriods,
    })),
    timetable: timetableReadable,
    totalCells: cells.reduce((sum, c) => sum + c.entries.length, 0),
  })
}

type JudgeVerdict = {
  violations: ConstraintViolation[]
  allSatisfied: boolean
  overallAssessment: string
}

function parseJudgeResponse(text: string): JudgeVerdict | null {
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed.allSatisfied === 'boolean') {
      return {
        violations: Array.isArray(parsed.violations)
          ? parsed.violations.filter((v: any) => v.violated === true)
          : [],
        allSatisfied: parsed.allSatisfied,
        overallAssessment: parsed.overallAssessment ?? '',
      }
    }
  } catch {
    // Try extracting JSON from code block
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (match) {
      try {
        const parsed = JSON.parse(match[1])
        return {
          violations: Array.isArray(parsed.violations)
            ? parsed.violations.filter((v: any) => v.violated === true)
            : [],
          allSatisfied: parsed.allSatisfied ?? false,
          overallAssessment: parsed.overallAssessment ?? '',
        }
      } catch { /* fall through */ }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// SSE streaming helpers
// ---------------------------------------------------------------------------

type AgentEvent =
  | { type: 'status'; message: string; iteration: number; maxIterations: number }
  | { type: 'code_fix'; attempt: number; error: string }
  | { type: 'judge_result'; violations: ConstraintViolation[]; allSatisfied: boolean; assessment: string }
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

function parseCompiledConstraints(text: string): Array<{
  id: string
  original: string
  description: string
  priority: 'hard' | 'soft'
  weight?: number
  code: string
}> | null {
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed
  } catch {
    const match = text.match(/\[[\s\S]*\]/)
    if (match) {
      try {
        const parsed = JSON.parse(match[0])
        if (Array.isArray(parsed)) return parsed
      } catch { /* fall through */ }
    }
  }
  return null
}

async function compileConstraints(
  payload: InputPayload,
  apiKey: string,
  model: string,
): Promise<Array<{ id: string; original: string; description: string; priority: 'hard' | 'soft'; weight?: number; code: string }>> {
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
  currentConstraints: Array<{ id: string; original: string; description: string; priority: 'hard' | 'soft'; weight?: number; code: string }>,
  failedIds: string[],
  errors: string,
  apiKey: string,
  model: string,
): Promise<Array<{ id: string; original: string; description: string; priority: 'hard' | 'soft'; weight?: number; code: string }>> {
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
        compiledConstraints: compiledConstraints.map(c => ({
          id: c.id,
          description: c.description,
          original: c.original,
          priority: c.priority,
          weight: c.weight,
          code: c.code,
        })),
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

    // Judge evaluation
    emit?.({ type: 'status', message: 'Đang kiểm tra ràng buộc...', iteration: attempt + 1, maxIterations: MAX_ATTEMPTS })

    const judgeMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: JUDGE_SYSTEM_PROMPT },
      { role: 'user', content: buildJudgeUserPrompt(payload, cells) },
    ]
    const judgeResponseText = await chatCompletion(judgeMessages, apiKey, model)
    const verdict = parseJudgeResponse(judgeResponseText)

    if (!verdict) {
      console.warn('[agent] Judge unparseable, accepting result')
      return {
        status: 'solved',
        message: '',
        diagnostics: ['Judge không phản hồi hợp lệ — chấp nhận kết quả.'],
        cells,
        compiledConstraints: compiledConstraints.map(c => ({ id: c.id, description: c.description, original: c.original, priority: c.priority, weight: c.weight, code: c.code })),
        unparsedConstraints: [],
        executionErrors: [],
        validationErrors: [],
        iisConstraintIds: [],
        violations: [],
        overallAssessment: null,
        solverStats: data.solverStats,
        modelRequestPreview: null,
      }
    }

    emit?.({ type: 'judge_result', violations: verdict.violations, allSatisfied: verdict.allSatisfied, assessment: verdict.overallAssessment })

    if (verdict.violations.length < bestViolationCount) {
      bestViolationCount = verdict.violations.length
      bestResult = {
        status: 'solved',
        message: '',
        diagnostics: [],
        cells,
        compiledConstraints: compiledConstraints.map(c => ({ id: c.id, description: c.description, original: c.original, priority: c.priority, weight: c.weight, code: c.code })),
        unparsedConstraints: [],
        executionErrors: [],
        validationErrors: [],
        iisConstraintIds: [],
        violations: verdict.violations,
        overallAssessment: verdict.overallAssessment,
        solverStats: data.solverStats,
        modelRequestPreview: null,
      }
    }

    if (verdict.allSatisfied && verdict.violations.length === 0) {
      console.log('[agent] All constraints satisfied at attempt', attempt + 1)
      bestResult!.diagnostics = [`Hoàn thành sau ${attempt + 1} lần thử.`]
      return bestResult!
    }

    // Fix constraints based on judge violations
    if (attempt < MAX_ATTEMPTS - 1 && verdict.violations.length > 0) {
      const violatedIds = verdict.violations.map(v => v.constraintId).filter(id => id.startsWith('hc_') || id.startsWith('sc_'))
      if (violatedIds.length > 0) {
        const errorSummary = verdict.violations
          .map(v => `[${v.constraintId}] "${v.original}" bị vi phạm: ${v.reason}`)
          .join('\n')
        compiledConstraints = await recompileConstraints(payload, compiledConstraints, violatedIds, errorSummary, apiKey, model)
      }
    }
  }

  if (bestResult) {
    bestResult.message = `Còn ${bestViolationCount} vi phạm sau ${MAX_ATTEMPTS} lần thử. Kết quả tốt nhất.`
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
