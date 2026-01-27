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
    const { paymentMethod, contentId, paymentCode, name, pay, userName, phoneNumber, oid: clientOid } = body

    // 필수 파라미터 검증
    if (!paymentMethod || !contentId || !paymentCode || !name || !pay) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      )
    }

    // 주문번호 생성 (클라이언트에서 보낸 oid가 있으면 사용, 없으면 생성)
    const oid = clientOid || generateOrderId()

    // 결제 URL 결정
    const paymentUrl = paymentMethod === 'card' 
      ? 'https://www.fortune82.com/api/payment/reqcard.html'
      : 'https://www.fortune82.com/api/payment/reqhp.html'

    // 성공/실패 URL 생성
    // 중요: 로컬(localhost) 테스트 중이라도 결제 서버가 localhost 리다이렉트를 막을 수 있으므로,
    // 운영 도메인(reunion.fortune82.com)으로 강제 리다이렉트하여 DB 업데이트를 트리거한다.
    // (로컬과 운영이 같은 Supabase DB를 쓴다면 로컬에서도 폴링으로 감지 가능)
    const productionOrigin = 'https://reunion.fortune82.com'
    const successUrl = `${productionOrigin}/payment/success?oid=${encodeURIComponent(oid)}`
    const failUrl = `${productionOrigin}/payment/error?code=T001&msg=close`

    // 결제 요청 데이터 준비
    // (성공/실패 리다이렉트 URL도 포함시켜 결제사가 우리 페이지로 돌아오게 함)
    const formData = {
      code: paymentCode,
      name: truncateStringByBytes(name, 50), // 최대 50byte 제한 (한글 고려)
      pay: pay.toString(),
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
