import { NextResponse } from 'next/server'

const LOWPRIZO_API_BASE_URL = process.env.PI_DEV_BASE_URL || process.env.LOWPRIZO_API_BASE_URL || 'https://api.lowprizo.com/v1'

function readApiKey(request: Request) {
  const auth = request.headers.get('authorization')?.trim() || ''
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  return request.headers.get('x-lowprizo-api-key')?.trim() || request.headers.get('x-api-key')?.trim() || bearer
}

export async function GET(request: Request) {
  const apiKey = readApiKey(request)

  if (!apiKey) {
    return NextResponse.json({ error: 'Vui lòng nhập Lowprizo API key.' }, { status: 400 })
  }

  try {
    const response = await fetch(`${LOWPRIZO_API_BASE_URL}/api/model-policy`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'x-api-key': apiKey,
      },
      cache: 'no-store',
    })

    const contentType = response.headers.get('content-type') || ''
    const body = contentType.includes('application/json') ? await response.json() : { error: await response.text() }

    return NextResponse.json(body, { status: response.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể kết nối đến máy chủ'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
