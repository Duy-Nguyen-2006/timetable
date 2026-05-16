import type { TimetableSolveResult } from './types'

export async function generateTimetableWithAI(payload: any, apiKey?: string): Promise<TimetableSolveResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (apiKey) {
    headers['x-lowprizo-api-key'] = apiKey
  }

  const response = await fetch('/api/generate-timetable', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.error ?? `API error ${response.status}`)
  }

  return data as TimetableSolveResult
}
