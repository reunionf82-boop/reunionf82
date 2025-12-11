import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT, PortalUserInfo } from '@/lib/portal-integration';

/**
 * 포털로부터 받은 JWT 토큰을 검증하는 엔드포인트
 * 
 * POST /api/portal/verify-token
 * 
 * 요청 본문:
 * {
 *   "token": "JWT_TOKEN"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { error: '토큰이 제공되지 않았습니다.' },
        { status: 400 }
      );
    }

    // JWT 토큰 검증
    const userInfo = verifyJWT(token);

    return NextResponse.json({
      success: true,
      userInfo,
    });
  } catch (error: any) {
    console.error('JWT token verification failed:', error);
    return NextResponse.json(
      { 
        error: '토큰 검증 실패',
        message: error.message || '유효하지 않은 토큰입니다.',
      },
      { status: 401 }
    );
  }
}





















