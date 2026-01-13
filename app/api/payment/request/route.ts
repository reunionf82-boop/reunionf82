import { NextRequest, NextResponse } from 'next/server'
import { generateOrderId } from '@/lib/payment-utils'

/**
 * 결제 요청 API
 * POST /api/payment/request
 * 
 * 요청 본문:
 * - paymentMethod: 'card' | 'mobile'
 * - contentId: number
 * - paymentCode: string (4자리)
 * - name: string
 * - pay: number
 * - userName: string
 * - phoneNumber: string
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { paymentMethod, contentId, paymentCode, name, pay, userName, phoneNumber } = body

    // 필수 파라미터 검증
    if (!paymentMethod || !contentId || !paymentCode || !name || !pay) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      )
    }

    // 주문번호 생성
    const oid = generateOrderId()

    // 결제 URL 결정
    const paymentUrl = paymentMethod === 'card' 
      ? 'https://www.fortune82.com/api/payment/reqcard.html'
      : 'https://www.fortune82.com/api/payment/reqhp.html'

    // 성공/실패 URL 생성 (현재 도메인 기준)
    const baseUrl = request.headers.get('origin') || request.nextUrl.origin
    const successUrl = `${baseUrl}/payment/success?oid=${encodeURIComponent(oid)}`
    const failUrl = `${baseUrl}/payment/error?code=T001&msg=close`

    // 결제 요청 데이터 준비
    const formData = {
      code: paymentCode,
      name: name.substring(0, 50), // 최대 50byte
      pay: pay.toString(),
      oid
    }

    return NextResponse.json({
      success: true,
      data: {
        oid,
        paymentUrl,
        formData,
        successUrl,
        failUrl
      }
    })
  } catch (error: any) {
    console.error('[결제 요청] 오류:', error)
    return NextResponse.json(
      { success: false, error: error.message || '결제 요청 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
