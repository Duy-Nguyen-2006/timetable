import { NextResponse } from 'next/server'

import type {
  TimetableSolveCell,
  TimetableSolveResult,
  ConstraintViolation,
} from '@/features/timetable/ai/types'
import { db } from '@/lib/db'
import { chatCompletion, detectModel } from '@/lib/llm-client'
import { runCodeInSandbox } from '@/lib/sandbox'
import { buildInputPayload, SYSTEM_PROMPT, type InputPayload } from '@/lib/timetable-prompt'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Max outer iterations (coder → sandbox → judge → feedback) */
const MAX_AGENT_ITERATIONS = 5
/** Max retries for runtime/sandbox errors within a single iteration */
const MAX_CODE_FIX_RETRIES = 5

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractCode(text: string): { code: string; isValid: boolean } {
  const match = text.match(/```(?:python)?\s*\n([\s\S]*?)\n```/)
  const code = match ? match[1].trim() : text.trim()

  // Detect if model output raw JSON instead of Python code
  if (code.startsWith('{') || code.startsWith('[')) {
    return { code, isValid: false }
  }
  // Detect if it's clearly not Python (e.g., starts with ```json)
  if (text.match(/```json/)) {
    return { code, isValid: false }
  }

  return { code, isValid: true }
}

function transformCells(
  rawCells: Array<{ assignmentId: string; slotId: string }>,
  payload: InputPayload,
): TimetableSolveCell[] {
  const slotMap = new Map(payload.slots.map(s => [s.id, s]))
  const assignmentMap = new Map(payload.assignments.map(a => [a.id, a]))

  const bySlot = new Map<string, TimetableSolveCell>()
  for (const cell of rawCells) {
    const slot = slotMap.get(cell.slotId)
    const assignment = assignmentMap.get(cell.assignmentId)
    if (!slot || !assignment) continue

    if (!bySlot.has(cell.slotId)) {
      bySlot.set(cell.slotId, {
        slotId: slot.id,
        dayId: slot.dayId,
        sessionId: slot.sessionId,
        period: slot.period,
        entries: [],
      })
    }
    bySlot.get(cell.slotId)!.entries.push({
      assignmentKey: assignment.id,
      subject: assignment.subjectLabel,
      teacher: assignment.teacherLabel,
      className: assignment.classLabel,
    })
  }

  return [...bySlot.values()]
}

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
// Agentic Loop
// ---------------------------------------------------------------------------

async function runAgenticLoop(
  payload: InputPayload,
  apiKey: string,
  model: string,
  emit?: (event: AgentEvent) => void,
): Promise<TimetableSolveResult> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify(payload) },
  ]

  let lastError: string | null = null
  let bestResult: TimetableSolveResult | null = null
  let bestViolationCount = Infinity

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    emit?.({
      type: 'status',
      message: iteration === 0
        ? 'Đang tạo thời khóa biểu...'
        : `Đang sửa lỗi và tạo lại... (lần ${iteration + 1}/${MAX_AGENT_ITERATIONS})`,
      iteration: iteration + 1,
      maxIterations: MAX_AGENT_ITERATIONS,
    })

    // --- Phase 1: Coder generates code ---
    let sandboxData: {
      status: string
      cells: Array<{ assignmentId: string; slotId: string }>
      objective: number | null
      iisConstraintIds: string[]
      errorMessage: string | null
    } | null = null

    // Inner loop: fix runtime errors
    for (let fix = 0; fix < MAX_CODE_FIX_RETRIES; fix++) {
      const responseText = await chatCompletion(messages, apiKey, model)
      const extracted = extractCode(responseText)
      messages.push({ role: 'assistant', content: responseText })

      // If model output JSON instead of Python code, ask again
      if (!extracted.isValid) {
        lastError = 'Model output JSON trực tiếp thay vì Python code'
        emit?.({ type: 'code_fix', attempt: fix + 1, error: lastError })
        messages.push({
          role: 'user',
          content: `BẠN PHẢI VIẾT CODE PYTHON sử dụng ortools CP-SAT solver. KHÔNG được output JSON trực tiếp. Hãy viết code Python hoàn chỉnh với import, model, variables, constraints, solve, và print JSON result. Chỉ output code Python trong block \`\`\`python.`,
        })
        continue
      }

      const result = await runCodeInSandbox(extracted.code, payload)

      if (!result.success) {
        lastError = result.error
        emit?.({ type: 'code_fix', attempt: fix + 1, error: result.error })
        messages.push({
          role: 'user',
          content: `Lỗi runtime khi chạy code:\n${result.error}\n\nHãy sửa code và thử lại. Chỉ output code Python.`,
        })
        continue
      }

      if (result.data.status === 'error') {
        lastError = result.data.errorMessage ?? 'Unknown solver error'
        emit?.({ type: 'code_fix', attempt: fix + 1, error: lastError })
        messages.push({
          role: 'user',
          content: `Solver báo lỗi: ${lastError}\n\nHãy sửa code và thử lại.`,
        })
        continue
      }

      // Code ran successfully
      sandboxData = result.data
      break
    }

    // If sandbox never succeeded in this iteration
    if (!sandboxData) {
      continue
    }

    // Handle infeasible — feed back to coder to fix constraint implementation
    if (sandboxData.status === 'infeasible') {
      const iisInfo = sandboxData.iisConstraintIds?.length
        ? `IIS constraints gây mâu thuẫn: ${sandboxData.iisConstraintIds.join(', ')}`
        : 'Không xác định được constraint nào gây mâu thuẫn.'

      emit?.({ type: 'code_fix', attempt: 0, error: `Solver báo infeasible. ${iisInfo}` })

      messages.push({
        role: 'user',
        content: `Solver báo INFEASIBLE (không tìm được lời giải). ${iisInfo}\n\nĐây có thể là do code constraint bị viết sai, KHÔNG PHẢI do ràng buộc thực sự mâu thuẫn. Hãy kiểm tra lại:\n1. Mapping ngày: thứ 2 = monday, thứ 3 = tuesday, thứ 4 = wednesday, thứ 5 = thursday, thứ 6 = friday\n2. Constraint có bị quá chặt không (ví dụ: dùng == thay vì <=)\n3. Có nhầm lẫn giữa slot period và day không\n\nViết lại code Python OR-Tools với constraints đúng. Chỉ output code Python.`,
      })
      continue
    }

    // --- Phase 2: Transform result ---
    const cells = transformCells(sandboxData.cells ?? [], payload)

    // --- Phase 3: Judge evaluates ---
    emit?.({
      type: 'status',
      message: 'Đang kiểm tra ràng buộc...',
      iteration: iteration + 1,
      maxIterations: MAX_AGENT_ITERATIONS,
    })

    const judgeMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: JUDGE_SYSTEM_PROMPT },
      { role: 'user', content: buildJudgeUserPrompt(payload, cells) },
    ]

    const judgeResponseText = await chatCompletion(judgeMessages, apiKey, model)
    const verdict = parseJudgeResponse(judgeResponseText)

    // If judge response is unparseable, accept the result
    if (!verdict) {
      console.warn('[agent] Judge response unparseable, accepting result')
      const result: TimetableSolveResult = {
        status: 'solved',
        message: '',
        diagnostics: ['Judge response không parse được — chấp nhận kết quả.'],
        cells,
        compiledConstraints: [],
        unparsedConstraints: [],
        executionErrors: [],
        validationErrors: [],
        iisConstraintIds: [],
        violations: [],
        overallAssessment: 'Judge không phản hồi hợp lệ.',
        solverStats: sandboxData.objective != null ? {
          wallTimeSeconds: 0,
          objectiveValue: sandboxData.objective,
          bestBound: null,
          numConflicts: 0,
          numBranches: 0,
        } : null,
        modelRequestPreview: null,
      }
      return result
    }

    emit?.({
      type: 'judge_result',
      violations: verdict.violations,
      allSatisfied: verdict.allSatisfied,
      assessment: verdict.overallAssessment,
    })

    // Track best result (fewest violations)
    if (verdict.violations.length < bestViolationCount) {
      bestViolationCount = verdict.violations.length
      bestResult = {
        status: 'solved',
        message: '',
        diagnostics: [],
        cells,
        compiledConstraints: [],
        unparsedConstraints: [],
        executionErrors: [],
        validationErrors: [],
        iisConstraintIds: [],
        violations: verdict.violations,
        overallAssessment: verdict.overallAssessment,
        solverStats: sandboxData.objective != null ? {
          wallTimeSeconds: 0,
          objectiveValue: sandboxData.objective,
          bestBound: null,
          numConflicts: 0,
          numBranches: 0,
        } : null,
        modelRequestPreview: null,
      }
    }

    // --- Phase 4: All satisfied → done! ---
    if (verdict.allSatisfied && verdict.violations.length === 0) {
      console.log('[agent] All constraints satisfied at iteration', iteration + 1)
      const result: TimetableSolveResult = {
        status: 'solved',
        message: '',
        diagnostics: [`Hoàn thành sau ${iteration + 1} lần thử.`],
        cells,
        compiledConstraints: [],
        unparsedConstraints: [],
        executionErrors: [],
        validationErrors: [],
        iisConstraintIds: [],
        violations: [],
        overallAssessment: verdict.overallAssessment,
        solverStats: sandboxData.objective != null ? {
          wallTimeSeconds: 0,
          objectiveValue: sandboxData.objective,
          bestBound: null,
          numConflicts: 0,
          numBranches: 0,
        } : null,
        modelRequestPreview: null,
      }
      return result
    }

    // --- Phase 5: Feed violations back to Coder ---
    const violationFeedback = verdict.violations.map((v, i) =>
      `${i + 1}. [${v.constraintId}] "${v.original}" — VI PHẠM: ${v.reason}`
    ).join('\n')

    // Build day mapping reminder from payload slots
    const dayMapping = [...new Set(payload.slots.map(s => `${s.dayLabel} = dayId "${s.dayId}"`))].join(', ')

    messages.push({
      role: 'user',
      content: `Kết quả thời khóa biểu bị vi phạm các ràng buộc sau:\n\n${violationFeedback}\n\nĐánh giá tổng: ${verdict.overallAssessment}\n\n[NHẮC LẠI MAPPING NGÀY]: ${dayMapping}\n[NHẮC LẠI]: "thứ 2" = monday, "thứ 3" = tuesday, "thứ 4" = wednesday, "thứ 5" = thursday, "thứ 6" = friday\n\nHãy viết lại code Python OR-Tools để sửa các vi phạm trên. Đảm bảo TẤT CẢ ràng buộc được thỏa mãn. Đặc biệt chú ý mapping ngày chính xác. Chỉ output code Python.`,
    })
  }

  // Exhausted all iterations — return best result
  if (bestResult) {
    bestResult.message = `Đã thử ${MAX_AGENT_ITERATIONS} lần nhưng vẫn còn ${bestViolationCount} vi phạm. Trả kết quả tốt nhất.`
    bestResult.diagnostics = [`Kết quả tốt nhất sau ${MAX_AGENT_ITERATIONS} iterations.`]
    return bestResult
  }

  // No result at all
  return {
    status: 'error',
    message: `Không thể tạo thời khóa biểu sau ${MAX_AGENT_ITERATIONS} lần thử. Lỗi cuối: ${lastError}`,
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
