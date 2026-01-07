import { NextRequest, NextResponse } from 'next/server';
import { verifyPaymentCallback, PaymentCallbackData } from '@/lib/portal-integration';

/**
 * 포털로부터 결제 완료 콜백을 받는 엔드포인트
 * 
 * POST /api/payment/callback
 * 
 * 요청 헤더:
 * - X-Portal-Signature: HMAC 서명
 * - X-Portal-Timestamp: 타임스탬프
 * 
 * 요청 본문:
 * {
 *   "paymentId": "payment_12345",
 *   "userId": "portal_user_12345",
 *   "contentId": 1,
 *   "status": "completed",
 *   "amount": 9900,
 *   "paymentMethod": "card",
 *   "transactionId": "mobilians_txn_12345",
 *   "timestamp": 1234567890
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body: PaymentCallbackData = await request.json();
    const signature = request.headers.get('X-Portal-Signature') || '';
    const timestamp = parseInt(request.headers.get('X-Portal-Timestamp') || '0');

    // 서명 검증
    if (!verifyPaymentCallback(body, signature, timestamp)) {
      return NextResponse.json(
        { error: '서명 검증 실패' },
        { status: 401 }
      );
    }

    // 결제 상태 확인
    if (body.status === 'completed') {
      // 결제 완료 처리
      // TODO: 여기서 AI 생성 프로세스를 시작하거나
      // 결제 완료 상태를 저장하여 사용자가 결과를 받을 수 있도록 처리
      return NextResponse.json({
        success: true,
        message: '결제 완료 처리되었습니다.',
      });
    } else if (body.status === 'cancelled') {
      return NextResponse.json({
        success: false,
        status: 'cancelled',
        message: '결제가 취소되었습니다.',
      });
    } else {
      // 결제 실패
      return NextResponse.json({
        success: false,
        status: 'failed',
        message: '결제 처리 중 오류가 발생했습니다.',
      });
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: '콜백 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

