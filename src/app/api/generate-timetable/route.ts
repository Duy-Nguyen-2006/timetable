import { randomUUID } from 'node:crypto'

import { NextResponse } from 'next/server'

import type { AgentEvent, GenerateTimetableRequest } from '@/features/timetable/ai/types'
import { buildInputPayload } from '@/lib/timetable-prompt'
import { runAgenticLoop } from './service'

function createSSEStream() {
  const encoder = new TextEncoder()
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
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

function resolveApiKey(input: GenerateTimetableRequest, request: Request) {
  const apiKeyFromBody = input.apiKey?.trim()
  const apiKeyFromHeader = request.headers.get('x-lowprizo-api-key')?.trim()
  return apiKeyFromHeader || apiKeyFromBody || ''
}

function resolveModel(request: Request) {
  return request.headers.get('x-model')?.trim() || 'devstral-latest'
}

export async function POST(request: Request) {
  const acceptSSE = request.headers.get('accept')?.includes('text/event-stream')

  try {
    const input = await request.json() as GenerateTimetableRequest
    const payload = buildInputPayload(input)
    const apiKey = resolveApiKey(input, request)
    const model = resolveModel(request)
    const requestId = randomUUID()
    const disableLlm = request.headers.get('x-disable-llm') === '1'

    const requestInput = {
      constraintConfirmations: input.constraintConfirmations,
      days: input.days,
      sessions: input.sessions,
      assignments: input.assignments,
      constraints: input.constraints,
    }

    if (!acceptSSE) {
      const result = await runAgenticLoop(payload, apiKey, model, undefined, requestId, disableLlm, requestInput)
      return NextResponse.json(result, {
        status: result.status === 'error' ? 503 : 200,
        headers: { 'x-request-id': requestId },
      })
    }

    const { stream, send, close } = createSSEStream()

    runAgenticLoop(payload, apiKey, model, send, requestId, disableLlm, requestInput)
      .then((result) => {
        send({ type: 'result', data: result })
        close()
      })
      .catch((err) => {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
        close()
      })

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'x-request-id': requestId,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể tạo thời khóa biểu.'
    console.error('[generate-timetable] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
