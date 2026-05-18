import { NextResponse } from 'next/server'

import type { TimetableSolveCell, TimetableSolveResult } from '@/features/timetable/ai/types'
import { db } from '@/lib/db'
import { chatCompletion, detectModel } from '@/lib/llm-client'
import { runCodeInSandbox } from '@/lib/sandbox'
import { buildInputPayload, SYSTEM_PROMPT, type InputPayload } from '@/lib/timetable-prompt'

const MAX_RETRIES = 5

function extractCode(text: string): string {
  const match = text.match(/```(?:python)?\s*\n([\s\S]*?)\n```/)
  if (match) return match[1].trim()
  return text.trim()
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

export async function POST(request: Request) {
  try {
    const input = await request.json()

    // 1. Resolve API key (body → header → DB)
    const apiKeyFromBody = typeof input?.apiKey === 'string' ? input.apiKey.trim() : ''
    let apiKey = apiKeyFromBody || request.headers.get('x-lowprizo-api-key')?.trim() || ''
    if (!apiKey) {
      const record = await db.apiKey.findFirst({ orderBy: { createdAt: 'desc' } })
      apiKey = record?.key ?? ''
    }
    if (!apiKey) {
      return NextResponse.json({ error: 'Vui lòng nhập Lowprizo API key.' }, { status: 400 })
    }

    // 2. Auto-detect model (never exposed to client)
    const model = await detectModel(apiKey)

    // 3. Build structured payload
    const payload = buildInputPayload(input)

    // 4. Agentic loop
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(payload) },
    ]

    let lastError: string | null = null
    let sandboxOutput: { status: string; cells: Array<{ assignmentId: string; slotId: string }>; objective: number | null; iisConstraintIds: string[]; errorMessage: string | null } | null = null

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const responseText = await chatCompletion(messages, apiKey, model)
      const code = extractCode(responseText)
      messages.push({ role: 'assistant', content: responseText })

      const result = await runCodeInSandbox(code, payload)

      if (!result.success) {
        lastError = result.error
        messages.push({
          role: 'user',
          content: `Lỗi khi chạy code:\n${result.error}\n\nHãy viết lại code để sửa lỗi này.`,
        })
        continue
      }

      const data = result.data
      if (data.status === 'infeasible') {
        sandboxOutput = data
        break
      }
      if (data.status === 'ok') {
        sandboxOutput = data
        break
      }

      // status === 'error' or unexpected
      lastError = data.errorMessage ?? 'Unknown solver error'
      messages.push({
        role: 'user',
        content: `Solver báo lỗi: ${lastError}\n\nHãy viết lại code để sửa lỗi này.`,
      })
    }

    if (!sandboxOutput) {
      const result: TimetableSolveResult = {
        status: 'error',
        message: `Không thể tạo thời khóa biểu sau ${MAX_RETRIES} lần thử. Lỗi cuối: ${lastError}`,
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
      return NextResponse.json(result)
    }

    const status = sandboxOutput.status === 'infeasible' ? 'infeasible' : 'solved'
    const cells = transformCells(sandboxOutput.cells ?? [], payload)
    const iisConstraintIds = sandboxOutput.iisConstraintIds ?? []
    const attemptCount = messages.filter(m => m.role === 'user').length - 1

    console.log('[generate-timetable]', { model, status, cells: cells.length, iisSize: iisConstraintIds.length, attempts: attemptCount })

    const result: TimetableSolveResult = {
      status,
      message: sandboxOutput.errorMessage ?? (status === 'infeasible' ? 'Không thể xếp thời khóa biểu (infeasible).' : ''),
      diagnostics: [],
      cells,
      compiledConstraints: [],
      unparsedConstraints: [],
      executionErrors: [],
      validationErrors: [],
      iisConstraintIds,
      violations: [],
      overallAssessment: null,
      solverStats: sandboxOutput.objective != null ? {
        wallTimeSeconds: 0,
        objectiveValue: sandboxOutput.objective,
        bestBound: null,
        numConflicts: 0,
        numBranches: 0,
      } : null,
      modelRequestPreview: null,
    }
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể tạo thời khóa biểu.'
    console.error('[generate-timetable] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
