import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { encrypt } from '@/lib/encryption'
import { getKSTNow } from '@/lib/payment-utils'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const session = cookieStore.get('admin_session')
    if (session?.value !== 'authenticated') {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const savedId = body?.savedId ? String(body.savedId).trim() : ''
    const requestKey = body?.requestKey ? String(body.requestKey).trim() : ''

    if (!savedId && !requestKey) {
      return NextResponse.json(
        { error: 'savedId 또는 requestKey 중 하나가 필요합니다.' },
        { status: 400 }
      )
    }

    const nowKst = new Date(getKSTNow())
    const expiresAt = new Date(nowKst.getTime() + 60 * 24 * 60 * 60 * 1000)
    const payload = {
      savedId: savedId || null,
      requestKey: requestKey || null,
      exp: expiresAt.toISOString()
    }

    const token = encrypt(JSON.stringify(payload))
    return NextResponse.json({
      success: true,
      token,
      expiresAt: expiresAt.toISOString()
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}
