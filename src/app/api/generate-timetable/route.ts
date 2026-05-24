import { NextResponse } from 'next/server'

import type { AgentEvent, GenerateTimetableRequest } from '@/features/timetable/ai/types'
import { db } from '@/lib/db'
import { detectModel } from '@/lib/llm-client'
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

export async function POST(request: Request) {
  const acceptSSE = request.headers.get('accept')?.includes('text/event-stream')

  try {
    const input = await request.json() as GenerateTimetableRequest

    const apiKeyFromBody = typeof input?.apiKey === 'string' ? input.apiKey.trim() : ''
    let apiKey = apiKeyFromBody || request.headers.get('x-lowprizo-api-key')?.trim() || ''
    if (!apiKey) {
      const record = await db.apiKey.findFirst({ orderBy: { createdAt: 'desc' } })
      apiKey = record?.key ?? ''
    }
    if (!apiKey) {
      return NextResponse.json({ error: 'Vui lòng nhập Lowprizo API key.' }, { status: 400 })
    }

    const model = await detectModel(apiKey)
    const payload = buildInputPayload(input)
    const useIRPipeline = input.features?.useIRPipeline ?? false
    const shadowMode = input.features?.shadowMode ?? false

    if (!acceptSSE) {
      const result = await runAgenticLoop(payload, apiKey, model, undefined, { useIRPipeline, shadowMode })
      return NextResponse.json(result)
    }

    const { stream, send, close } = createSSEStream()

    runAgenticLoop(payload, apiKey, model, send, { useIRPipeline, shadowMode })
      .then((result) => {
        send({ type: 'result', data: result })
        close()
      })
      .catch((err) => {
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
