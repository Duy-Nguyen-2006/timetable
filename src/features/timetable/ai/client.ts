import type { TimetableSolveResult, AgentEvent, SolverRequestPayload } from './types'

export type AgentProgressCallback = (event: AgentEvent) => void

export async function generateTimetableWithAI(
  payload: SolverRequestPayload,
  apiKey?: string,
  onProgress?: AgentProgressCallback,
  options?: { disableLlm?: boolean },
): Promise<TimetableSolveResult> {
  const effectiveApiKey = apiKey ?? payload?.apiKey
  if (!effectiveApiKey?.trim()) {
    throw new Error('Vui lòng nhập Lowprizo API key trước khi xếp lịch.')
  }

  if (!onProgress) {
    const response = await fetch('/api/generate-timetable', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-lowprizo-api-key': effectiveApiKey,
        ...(options?.disableLlm ? { 'x-disable-llm': '1' } : {}),
      },
      body: JSON.stringify({ ...payload, apiKey: effectiveApiKey }),
    })

    const data = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(data?.error ?? `API error ${response.status}`)
    }
    return data as TimetableSolveResult
  }

  const response = await fetch('/api/generate-timetable', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'x-lowprizo-api-key': effectiveApiKey,
      ...(options?.disableLlm ? { 'x-disable-llm': '1' } : {}),
    },
    body: JSON.stringify({ ...payload, apiKey: effectiveApiKey }),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error ?? `API error ${response.status}`)
  }

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
    const messages = buffer.split('\n\n')
    buffer = messages.pop() ?? ''

    for (const message of messages) {
      const lines = message.split('\n').filter((line) => line.startsWith('data: '))
      if (lines.length === 0) continue
      const data = lines.map((line) => line.slice(6)).join('\n').trim()

      if (data === '[DONE]') continue

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
      }
    }
  }

  if (!finalResult) {
    throw new Error('Stream ended without a result')
  }

  return finalResult
}
