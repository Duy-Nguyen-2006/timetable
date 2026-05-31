import { NextResponse } from 'next/server'
import { type ProviderType, resolveProvider, normalizeBaseURL } from '@/lib/provider'

type TestProviderPayload = {
  provider?: ProviderType
  baseURL?: string
  apiKey?: string
  model?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TestProviderPayload
    const baseURL = normalizeBaseURL(String(body.baseURL ?? '').trim())
    const apiKey = String(body.apiKey ?? '').trim()
    const model = String(body.model ?? '').trim()
    const provider = resolveProvider(body.provider, baseURL, model)

    if (!baseURL || !apiKey) {
      return NextResponse.json(
        { ok: false, message: 'Thiếu Base URL hoặc API Key.' },
        { status: 400 },
      )
    }

    const modelsRes = await fetch(`${baseURL}/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    })

    if (modelsRes.ok) {
      return NextResponse.json({
        ok: true,
        message: '✅ Kết nối thành công! Provider phản hồi endpoint /models.',
      })
    }

    if (model) {
      const useResponses = provider === 'openai-responses'
      const chatRes = await fetch(`${baseURL}${useResponses ? '/responses' : '/chat/completions'}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(useResponses
          ? {
              model,
              input: [{ role: 'user', content: 'ping' }],
              max_output_tokens: 1,
              store: false,
            }
          : {
              model,
              messages: [{ role: 'user', content: 'ping' }],
              max_tokens: 1,
              temperature: 0,
            }),
      })

      if (chatRes.ok) {
        return NextResponse.json({
          ok: true,
          message: `✅ Kết nối thành công! /models không khả dụng nhưng model vẫn gọi được qua ${useResponses ? '/responses' : '/chat/completions'}.`,
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

