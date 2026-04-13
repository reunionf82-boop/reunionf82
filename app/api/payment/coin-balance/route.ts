import { NextRequest, NextResponse } from 'next/server'

const CVALUE_URL = 'https://www.fortune82.com/api/payment/cvalue.html'

/**
 * POST /api/payment/coin-balance
 * Body: { uno: string } — 포춘82 회원번호(쿠키 uno와 동일)
 * 성공: { success: true, balance: number }
 * 실패: { success: false, error: string, code?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const unoRaw = body?.uno
    const uno = String(unoRaw ?? '').replace(/\D/g, '').trim()
    const unoNum = parseInt(uno, 10)
    if (!uno || !Number.isFinite(unoNum) || unoNum <= 0) {
      return NextResponse.json(
        { success: false, error: '회원 정보(uno)가 올바르지 않습니다.' },
        { status: 400 }
      )
    }

    const formData = new URLSearchParams()
    formData.append('uno', String(unoNum))

    const response = await fetch(CVALUE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    })

    const text = (await response.text()).trim()

    if (/^\d+$/.test(text)) {
      const balance = parseInt(text, 10)
      return NextResponse.json({ success: true, balance })
    }

    return NextResponse.json({
      success: false,
      error: '코인 잔액을 가져오지 못했습니다.',
      code: text,
    })
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || '코인 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
