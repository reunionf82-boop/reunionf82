import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function isAllowedImageUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false

    // SSRF 방지: Supabase 스토리지(동일 호스트)만 허용
    const supabaseBase = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    if (!supabaseBase) return false
    const supa = new URL(supabaseBase)

    const host = u.hostname.toLowerCase()
    const allowedHost = supa.hostname.toLowerCase()

    // 환경변수 호스트가 커스텀 도메인인 경우에도, Supabase 기본 도메인(public URL)이 섞일 수 있어
    // Supabase 계열 도메인은 추가로 허용한다.
    return (
      host === allowedHost ||
      host.endsWith('.supabase.co') ||
      host.endsWith('.supabase.in')
    )
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl.searchParams.get('url') || ''
    if (!url) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 })
    }
    if (!isAllowedImageUrl(url)) {
      return NextResponse.json({ error: 'url not allowed' }, { status: 400 })
    }

    const upstream = await fetch(url, { cache: 'no-store' })
    if (!upstream.ok) {
      return NextResponse.json(
        { error: 'upstream fetch failed', status: upstream.status },
        { status: 502 }
      )
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    const buf = await upstream.arrayBuffer()

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        // 캔버스 캡처용: 동일 오리진이므로 크게 필요 없지만, 안전하게 허용
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

