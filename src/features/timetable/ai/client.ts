import type { TimetableSolveResult } from './types'

export async function generateTimetableWithAI(payload: any, apiKey?: string): Promise<TimetableSolveResult> {
  const effectiveApiKey = apiKey ?? payload?.apiKey
  if (!effectiveApiKey?.trim()) {
    throw new Error('Vui lòng nhập Lowprizo API key trước khi xếp lịch.')
  }

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
