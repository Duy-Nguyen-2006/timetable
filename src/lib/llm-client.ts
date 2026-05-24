const API_BASE = 'https://api.lowprizo.com'
const DEFAULT_MODEL = 'devstral-latest'
const MODEL_CACHE_TTL_MS = 10 * 60 * 1000

type ModelCacheEntry = {
  model: string
  expiresAt: number
}

const modelCache = new Map<string, ModelCacheEntry>()

export async function detectModel(apiKey: string): Promise<string> {
  const now = Date.now()
  const cached = modelCache.get(apiKey)
  if (cached && cached.expiresAt > now) return cached.model

  let resolvedModel = DEFAULT_MODEL

  try {
    const res = await fetch(`${API_BASE}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    })

    if (res.ok) {
      const data = await res.json()
      const models: unknown[] = data?.data ?? data?.models ?? []
      if (Array.isArray(models) && models.length > 0) {
        const first = models[0] as Record<string, unknown>
        resolvedModel = (typeof first?.id === 'string' ? first.id : null) ?? DEFAULT_MODEL
      }
    }
  } catch {
    // fall through to default
  }

  modelCache.set(apiKey, {
    model: resolvedModel,
    expiresAt: now + MODEL_CACHE_TTL_MS,
  })

  return resolvedModel
}

export async function chatCompletion(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  apiKey: string,
  model: string,
): Promise<string> {
  const res = await fetch(`${API_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0 }),
    signal: AbortSignal.timeout(180_000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`LLM API error ${res.status}: ${text}`)
  }
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
  return data.choices?.[0]?.message?.content ?? ''
}
