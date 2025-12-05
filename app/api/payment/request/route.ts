import { NextRequest, NextResponse } from 'next/server';
import { requestPayment, PaymentRequestData } from '@/lib/portal-integration';

/**
 * 포털에 결제 요청을 보내는 엔드포인트
 * 
 * POST /api/payment/request
 * 
 * 요청 본문:
 * {
 *   "userId": "portal_user_12345",
 *   "contentId": 1,
 *   "contentName": "재회 성공률 점사",
 *   "price": 9900,
 *   "userInfo": { ... },
 *   "partnerInfo": { ... },  // 궁합형인 경우만
 *   "callbackUrl": "https://subdomain.example.com/api/payment/callback",
 *   "returnUrl": "https://subdomain.example.com/form?payment=success",
 *   "cancelUrl": "https://subdomain.example.com/form?payment=cancel"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body: PaymentRequestData = await request.json();

    // 필수 필드 검증
    if (!body.userId || !body.contentId || !body.userInfo) {
      return NextResponse.json(
        { error: '필수 필드가 누락되었습니다.' },
        { status: 400 }
      );
    }

    // 콜백 URL 설정 (환경 변수 또는 기본값)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://subdomain.example.com';
    body.callbackUrl = body.callbackUrl || `${baseUrl}/api/payment/callback`;
    body.returnUrl = body.returnUrl || `${baseUrl}/form?payment=success`;
    body.cancelUrl = body.cancelUrl || `${baseUrl}/form?payment=cancel`;

    // 포털에 결제 요청
    const result = await requestPayment(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || '결제 요청 실패' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      paymentUrl: result.paymentUrl,
    });
  } catch (error: any) {
    console.error('Payment request error:', error);
    return NextResponse.json(
      { error: '결제 요청 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}







