import { NextRequest, NextResponse } from 'next/server'
import { decrypt } from '@/lib/encryption'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const token = searchParams.get('token')
    if (!token) {
      return NextResponse.json(
        { error: 'token이 필요합니다.' },
        { status: 400 }
      )
    }

    let decrypted: string
    try {
      decrypted = decrypt(token)
    } catch (e) {
      return NextResponse.json(
        { error: '유효하지 않은 토큰입니다.' },
        { status: 400 }
      )
    }

    let payload: any
    try {
      payload = JSON.parse(decrypted)
    } catch (e) {
      return NextResponse.json(
        { error: '토큰 파싱에 실패했습니다.' },
        { status: 400 }
      )
    }

    const expiresAt = payload?.exp ? new Date(payload.exp) : null
    if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
      return NextResponse.json(
        { error: '토큰 만료 정보를 확인할 수 없습니다.' },
        { status: 400 }
      )
    }
    if (Date.now() > expiresAt.getTime()) {
      return NextResponse.json(
        { error: '토큰이 만료되었습니다.' },
        { status: 410 }
      )
    }

    const savedId = payload?.savedId ? String(payload.savedId) : ''
    const requestKey = payload?.requestKey ? String(payload.requestKey) : ''

    if (!savedId && !requestKey) {
      return NextResponse.json(
        { error: '복구 가능한 정보가 없습니다.' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      savedId: savedId || null,
      requestKey: requestKey || null,
      expiresAt: expiresAt.toISOString()
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}
