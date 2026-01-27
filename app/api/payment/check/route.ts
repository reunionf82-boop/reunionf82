import { NextRequest, NextResponse } from 'next/server'

/**
 * 결제 상태 확인 API
 * POST /api/payment/check
 * 
 * 요청 본문:
 * - oid: string (주문번호)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { oid } = body

    if (!oid) {
      return NextResponse.json(
        { success: false, error: '주문번호가 필요합니다.' },
        { status: 400 }
      )
    }

    // 결제 상태 확인 서버로 요청
    const formData = new URLSearchParams()
    formData.append('oid', oid)

    const response = await fetch('https://www.fortune82.com/api/payment/pcheck.html', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString()
    })

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: '결제 상태 확인 서버 오류' },
        { status: 500 }
      )
    }

    const result = await response.text()
    const status = result.trim().toUpperCase()

    // 응답: Y = 결제완료, N = 미결제, E = 기타오류
    return NextResponse.json({
      success: true,
      data: {
        oid,
        status,
        isPaid: status === 'Y'
      }
    })
  } catch (error: any) {

    return NextResponse.json(
      { success: false, error: error.message || '결제 상태 확인 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
