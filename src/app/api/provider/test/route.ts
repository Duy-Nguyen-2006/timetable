import { NextResponse } from 'next/server'

type TestProviderPayload = {
  baseURL?: string
  apiKey?: string
  model?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TestProviderPayload
    const baseURL = String(body.baseURL ?? '').trim().replace(/\/$/, '')
    const apiKey = String(body.apiKey ?? '').trim()
    const model = String(body.model ?? '').trim()

    if (!baseURL || !apiKey) {
      return NextResponse.json(
        { ok: false, message: 'Thiếu Base URL hoặc API Key.' },
        { status: 400 },
      )
    }

    const authHeaders = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }

    // 1) Try /models first (many OpenAI-compatible providers support this)
    const modelsRes = await fetch(`${baseURL}/models`, {
      method: 'GET',
      headers: authHeaders,
      cache: 'no-store',
    })

    if (modelsRes.ok) {
      return NextResponse.json({
        ok: true,
        message: '✅ Kết nối thành công! Provider phản hồi endpoint /models.',
      })
    }

    // 2) Fallback to a tiny chat completion request (some providers disable /models)
    if (model) {
      const chatRes = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: authHeaders,
        cache: 'no-store',
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          temperature: 0,
        }),
      })

      if (chatRes.ok) {
        return NextResponse.json({
          ok: true,
          message:
            '✅ Kết nối thành công! /models không khả dụng nhưng model vẫn gọi được qua /chat/completions.',
        })
      }

      const errorText = await chatRes.text()
      return NextResponse.json(
        {
          ok: false,
          message: `❌ Không kết nối được tới model. HTTP ${chatRes.status} ${chatRes.statusText}`,
          details: errorText.slice(0, 400),
        },
        { status: 200 },
      )
    }

    const modelsErrorText = await modelsRes.text()
    return NextResponse.json(
      {
        ok: false,
        message: `❌ Không thể xác thực provider. HTTP ${modelsRes.status} ${modelsRes.statusText}`,
        details: modelsErrorText.slice(0, 400),
      },
      { status: 200 },
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      {
        ok: false,
        message: `❌ Không kết nối được: ${msg}`,
      },
      { status: 200 },
    )
  }
}

