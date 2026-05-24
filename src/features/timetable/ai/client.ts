import type { TimetableSolveResult, AgentEvent, GenerateTimetableRequest } from './types'

// ---------------------------------------------------------------------------
// Agent event types (mirrors server-side AgentEvent)
// ---------------------------------------------------------------------------

export type AgentProgressCallback = (event: AgentEvent) => void

// ---------------------------------------------------------------------------
// Streaming client (SSE)
// ---------------------------------------------------------------------------

export async function generateTimetableWithAI(
  payload: GenerateTimetableRequest,
  apiKey?: string,
  onProgress?: AgentProgressCallback,
): Promise<TimetableSolveResult> {
  const effectiveApiKey = apiKey ?? payload?.apiKey
  if (!effectiveApiKey?.trim()) {
    throw new Error('Vui lòng nhập Lowprizo API key trước khi xếp lịch.')
  }

  // If no progress callback, use simple JSON request (backward compat)
  if (!onProgress) {
    const response = await fetch('/api/generate-timetable', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-lowprizo-api-key': effectiveApiKey,
      },
      body: JSON.stringify({ ...payload, apiKey: effectiveApiKey }),
    })

    const data = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(data?.error ?? `API error ${response.status}`)
    }
    return data as TimetableSolveResult
  }

  // Streaming path with SSE
  const response = await fetch('/api/generate-timetable', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'x-lowprizo-api-key': effectiveApiKey,
    },
    body: JSON.stringify({ ...payload, apiKey: effectiveApiKey }),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error ?? `API error ${response.status}`)
  }

  // Parse SSE stream
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Response body is not readable')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let finalResult: TimetableSolveResult | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // Process complete SSE messages
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? '' // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()

      if (data === '[DONE]') break

      try {
        const event = JSON.parse(data) as AgentEvent
        onProgress(event)

        if (event.type === 'result') {
          finalResult = event.data
        } else if (event.type === 'error') {
          throw new Error(event.message)
        }
      } catch (e) {
        if (e instanceof Error && e.message !== data) throw e
        // Ignore parse errors for malformed events
      }
    }
  }

  if (!finalResult) {
    throw new Error('Stream ended without a result')
  }

  return finalResult
}
