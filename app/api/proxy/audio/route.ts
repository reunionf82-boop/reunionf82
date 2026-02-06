import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function isAllowedAudioUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    const supabaseBase = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    if (!supabaseBase) return false
    const host = u.hostname.toLowerCase()
    const allowedHost = new URL(supabaseBase).hostname.toLowerCase()
    return (
      host === allowedHost ||
      host.endsWith('.supabase.co') ||
      host.endsWith('.supabase.in')
    )
  } catch {
    return false
  }
}

/** 오디오 URL을 같은 오리진으로 프록시해, AudioContext/녹음 믹스 시 CORS 오류를 방지합니다. */
export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl.searchParams.get('url') || ''
    if (!url) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 })
    }
    if (!isAllowedAudioUrl(url)) {
      return NextResponse.json({ error: 'url not allowed' }, { status: 400 })
    }

    const upstream = await fetch(url, { cache: 'no-store' })
    if (!upstream.ok) {
      return NextResponse.json(
        { error: 'upstream fetch failed', status: upstream.status },
        { status: 502 }
      )
    }

    const contentType = upstream.headers.get('content-type') || 'audio/mpeg'
    const buf = await upstream.arrayBuffer()

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: 'server error', details: e?.message || String(e) },
      { status: 500 }
    )
  }
}
