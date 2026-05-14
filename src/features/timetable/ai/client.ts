export async function generateTimetableWithAI(payload: any) {
  const response = await fetch('/api/generate-timetable', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error ?? `API error ${response.status}`)
  }

  const data = await response.json()
  return data.result ?? 'Không có kết quả.'
}
