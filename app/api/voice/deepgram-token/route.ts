import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const key = process.env.DEEPGRAM_API_KEY
  if (!key) {
    return NextResponse.json({ error: 'DEEPGRAM_API_KEY not configured' }, { status: 500 })
  }
  return NextResponse.json({ key })
}
