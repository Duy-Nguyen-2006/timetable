import type { TimetableSolveResult } from './types'

export async function generateTimetableWithAI(payload: any): Promise<TimetableSolveResult> {
  const response = await fetch('/api/generate-timetable', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.error ?? `API error ${response.status}`)
  }

  return data as TimetableSolveResult
}
