import OpenAI from 'openai'
import { NextResponse } from 'next/server'

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type ChatPayload = {
  baseURL?: string
  apiKey?: string
  model?: string
  messages?: ChatMessage[]
  temperature?: number
  max_tokens?: number
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatPayload
    const baseURL = String(body.baseURL ?? '').trim()
    const apiKey = String(body.apiKey ?? '').trim()
    const model = String(body.model ?? '').trim()
    const messages = Array.isArray(body.messages) ? body.messages : []

    if (!baseURL || !apiKey || !model || messages.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Missing baseURL/apiKey/model/messages' },
        { status: 400 },
      )
    }

    const client = new OpenAI({
      apiKey,
      baseURL,
    })

    const completion = await client.chat.completions.create({
      model,
      messages,
      temperature: body.temperature ?? 0.2,
      max_tokens: body.max_tokens ?? 4000,
    })

    const content = completion.choices[0]?.message?.content || ''

    return NextResponse.json({
      ok: true,
      content,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown server error',
      },
      { status: 500 },
    )
  }
}

