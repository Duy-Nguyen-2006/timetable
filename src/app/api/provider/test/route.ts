import { NextResponse } from 'next/server'
import { type ProviderType, resolveProvider, normalizeBaseURL } from '@/lib/provider'

type TestProviderPayload = {
  provider?: ProviderType
  baseURL?: string
  apiKey?: string
  model?: string
}

const PROVIDER_TEST_TIMEOUT_MS = 12_000

function validateBaseURL(raw: string): { ok: true; url: URL } | { ok: false; message: string } {
  if (!raw) return { ok: false, message: 'Thiếu Base URL.' }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, message: 'Base URL không hợp lệ.' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, message: 'Base URL phải bắt đầu bằng http:// hoặc https://' }
  }
  return { ok: true, url }
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs = PROVIDER_TEST_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TestProviderPayload
    const baseURL = normalizeBaseURL(String(body.baseURL ?? '').trim())
    const validation = validateBaseURL(baseURL)
    if (!validation.ok) {
      return NextResponse.json({ ok: false, message: validation.message }, { status: 400 })
    }
    const apiKey = String(body.apiKey ?? '').trim()
    const model = String(body.model ?? '').trim()
    const provider = resolveProvider(body.provider, baseURL, model)
    const isOpenRouter = provider === 'openrouter' || baseURL.toLowerCase().includes('openrouter.ai')

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, message: 'Thiếu API Key.' },
        { status: 400 },
      )
    }

    if (!model) {
      return NextResponse.json(
        { ok: false, message: 'Thiếu Model.' },
        { status: 400 },
      )
    }

    if (isOpenRouter) {
      const authRes = await fetchWithTimeout(`${baseURL}/auth/key`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store',
      })

      if (!authRes.ok) {
        const errorText = await authRes.text()
        return NextResponse.json(
          {
            ok: false,
            message: `❌ API key OpenRouter không hợp lệ. HTTP ${authRes.status} ${authRes.statusText}`,
            details: errorText.slice(0, 400),
          },
          { status: 200 },
        )
      }

      const modelsRes = await fetchWithTimeout(`${baseURL}/models`, {
        method: 'GET',
        cache: 'no-store',
      })

      if (!modelsRes.ok) {
        const errorText = await modelsRes.text()
        return NextResponse.json(
          {
            ok: false,
            message: `❌ Không tải được danh sách model OpenRouter. HTTP ${modelsRes.status} ${modelsRes.statusText}`,
            details: errorText.slice(0, 400),
          },
          { status: 200 },
        )
      }

      const modelsPayload = await modelsRes.json().catch(() => null) as { data?: Array<{ id?: string }> } | null
      const modelExists = Array.isArray(modelsPayload?.data)
        ? modelsPayload.data.some((item) => item.id === model)
        : false

      if (!modelExists) {
        return NextResponse.json(
          {
            ok: false,
            message: '❌ API key hợp lệ nhưng model không có trong OpenRouter.',
            details: `Model đang nhập: ${model}`,
          },
          { status: 200 },
        )
      }

      return NextResponse.json({
        ok: true,
        message: '✅ Kết nối thành công! API key OpenRouter hợp lệ và model tồn tại.',
      })
    }

    const useResponses = provider === 'openai-responses'
    const chatRes = await fetchWithTimeout(`${baseURL}${useResponses ? '/responses' : '/chat/completions'}`, {
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
        message: `✅ Kết nối thành công! API key và model gọi được qua ${useResponses ? '/responses' : '/chat/completions'}.`,
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
  } catch (error) {
    const isAbort =
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError')
    const msg = isAbort
      ? `Provider không phản hồi trong ${PROVIDER_TEST_TIMEOUT_MS / 1000}s.`
      : error instanceof Error
        ? error.message
        : 'Unknown error'
    return NextResponse.json(
      {
        ok: false,
        message: `❌ Không kết nối được: ${msg}`,
      },
      { status: 200 },
    )
  }
}

