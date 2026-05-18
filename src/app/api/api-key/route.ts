import { NextResponse } from 'next/server'

import { db } from '@/lib/db'

export async function GET() {
  const record = await db.apiKey.findFirst({ orderBy: { createdAt: 'desc' } })
  if (!record) return NextResponse.json({ key: null })
  // Return masked key: show prefix + last 4 chars
  const masked = record.key.slice(0, 12) + '...' + record.key.slice(-4)
  return NextResponse.json({ key: masked, id: record.id })
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const key = (body as Record<string, unknown>)?.key
  if (typeof key !== 'string' || !key.trim()) {
    return NextResponse.json({ error: 'key is required' }, { status: 400 })
  }

  await db.apiKey.deleteMany()
  const record = await db.apiKey.create({ data: { key: key.trim() } })
  return NextResponse.json({ success: true, id: record.id })
}

export async function DELETE() {
  await db.apiKey.deleteMany()
  return NextResponse.json({ success: true })
}
