import { NextResponse } from 'next/server'

import { buildTimetablePrompts } from '@/features/timetable/ai/prompt'

const API_BASE_URL = process.env.LOWPRIZO_API_BASE_URL || 'https://api.lowprizo.com'
const API_KEY = process.env.LOWPRIZO_API_KEY
const API_MODEL = 'gpt-5.2'

export async function POST(request: Request) {
  if (!API_KEY) {
    return NextResponse.json(
      { error: 'Thiếu API key. Hãy cấu hình LOWPRIZO_API_KEY trong .env.local.' },
      { status: 500 },
    )
  }

  try {
    const payload = await request.json()
    const { systemPrompt, userPrompt } = buildTimetablePrompts(payload)

    const response = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
        'x-api-key': API_KEY,
      },
      body: JSON.stringify({
        model: API_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
      }),
      cache: 'no-store',
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json({ error: `API error ${response.status}: ${errorText}` }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json({ result: data.choices?.[0]?.message?.content ?? 'Không có kết quả.' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể tạo thời khóa biểu.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
