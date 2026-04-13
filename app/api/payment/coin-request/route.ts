import { NextRequest, NextResponse } from 'next/server'
import { truncateStringByBytes } from '@/lib/payment-utils'
import { mapPaymentCodeToCoinItemCode } from '@/lib/fortune82-coin'

/**
 * 코인 결제 폼 데이터 준비 (클라이언트가 www.fortune82.com 으로 POST submit)
 * POST /api/payment/coin-request
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { oid, uno, paymentCode, name, pay } = body

    if (!oid || !uno || !paymentCode || name == null || pay == null) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      )
    }

    const unoNum = parseInt(String(uno).replace(/\D/g, ''), 10)
    if (!Number.isFinite(unoNum) || unoNum <= 0) {
      return NextResponse.json(
        { success: false, error: '회원 번호(uno)가 올바르지 않습니다.' },
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

    const codeStr = mapPaymentCodeToCoinItemCode(String(paymentCode))

    const paymentUrl = 'https://www.fortune82.com/api/payment/reqcoin.html'

    const formData = {
      uno: String(unoNum),
      code: codeStr.slice(0, 4),
      name: truncateStringByBytes(String(name ?? ''), 50),
      pay: String(Math.floor(payNum)),
      oid: String(oid),
    }

    return NextResponse.json({
      success: true,
      data: {
        paymentUrl,
        formData,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '코인 결제 요청 준비 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
