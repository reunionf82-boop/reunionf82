import { NextRequest, NextResponse } from 'next/server'
import { generateOrderId, truncateStringByBytes } from '@/lib/payment-utils'

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
    const { paymentMethod, contentId, paymentCode, name, pay, userName, phoneNumber, oid: clientOid, successOrigin: clientSuccessOrigin } = body

    // 필수 파라미터 검증
    if (!paymentMethod || !contentId || !paymentCode || !name || !pay) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      )
    }

    const payNum = Number(pay)
    if (!Number.isFinite(payNum) || payNum <= 0) {
      return NextResponse.json(
        { success: false, error: '결제 금액이 올바르지 않습니다.' },
        { status: 400 }
      )
    }

    const codeStr = String(paymentCode).trim()
    if (!codeStr || codeStr.length < 4) {
      return NextResponse.json(
        { success: false, error: '결제 코드가 올바르지 않습니다.' },
        { status: 400 }
      )
    }

    // 주문번호 생성 (클라이언트에서 보낸 oid가 있으면 사용, 없으면 생성)
    const oid = clientOid || generateOrderId()

    // 결제 URL 결정
    const paymentUrl = paymentMethod === 'card' 
      ? 'https://www.fortune82.com/api/payment/reqcard.html'
      : 'https://www.fortune82.com/api/payment/reqhp.html'

    // 성공/실패 URL: 클라이언트가 successOrigin 전달 시 해당 origin 사용(로컬 개발용), 아니면 운영 도메인
    const productionOrigin = 'https://reunion.fortune82.com'
    const allowedOrigin = typeof clientSuccessOrigin === 'string' && clientSuccessOrigin.trim() &&
      (clientSuccessOrigin.startsWith('http://localhost') || clientSuccessOrigin.startsWith('https://localhost') || clientSuccessOrigin === productionOrigin)
      ? clientSuccessOrigin.replace(/\/$/, '')
      : productionOrigin
    const successUrl = `${allowedOrigin}/payment/success?oid=${encodeURIComponent(oid)}`
    const failUrl = `${allowedOrigin}/payment/error?code=T001&msg=close`

    // 결제 요청 데이터 준비
    // (성공/실패 리다이렉트 URL도 포함시켜 결제사가 우리 페이지로 돌아오게 함)
    const formData = {
      code: codeStr.slice(0, 4),
      name: truncateStringByBytes(name, 50), // 최대 50byte 제한 (한글 고려)
      pay: String(payNum),
      oid,
      successUrl,
      failUrl,
      // 호환 키 (결제사 구현에 따라 snake_case를 쓰는 경우 대비)
      success_url: successUrl,
      fail_url: failUrl,
      returnUrl: successUrl,
      return_url: successUrl,
      ret_url: successUrl,
      nextUrl: successUrl,
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

    return NextResponse.json(
      { success: false, error: error.message || '결제 요청 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
