/**
 * 포털 연동 유틸리티 함수
 */

import crypto from 'crypto';

// 환경 변수
const PORTAL_API_URL = process.env.PORTAL_API_URL || '';
const PORTAL_API_KEY = process.env.PORTAL_API_KEY || '';
const PORTAL_SECRET_KEY = process.env.PORTAL_SECRET_KEY || '';
const JWT_SECRET = process.env.JWT_SECRET || '';

/**
 * JWT 토큰 검증 및 디코딩
 */
export interface PortalUserInfo {
  userId: string;
  name: string;
  gender: 'male' | 'female';
  birthDate: string; // YYYY-MM-DD
  birthTime: string; // HH:mm
  calendarType: 'solar' | 'lunar' | 'lunar-leap';
  contentId?: number;
  iat?: number;
  exp?: number;
}

export function verifyJWT(token: string): PortalUserInfo {
  try {
    // JWT 구조: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    // Payload 디코딩
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf-8')
    );

    // 만료 시간 검증
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('JWT token expired');
    }

    // 서명 검증
    const signature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${parts[0]}.${parts[1]}`)
      .digest('base64url');

    if (signature !== parts[2]) {
      throw new Error('Invalid JWT signature');
    }

    return payload as PortalUserInfo;
  } catch (error) {
    console.error('JWT verification failed:', error);
    throw error;
  }
}

/**
 * HMAC 서명 생성
 */
export function generateHMACSignature(
  data: any,
  secretKey: string,
  timestamp: number
): string {
  const message = JSON.stringify(data) + timestamp;
  return crypto
    .createHmac('sha256', secretKey)
    .update(message)
    .digest('hex');
}

/**
 * HMAC 서명 검증
 */
export function verifyHMACSignature(
  data: any,
  signature: string,
  secretKey: string,
  timestamp: number,
  maxAge: number = 300 // 기본 5분
): boolean {
  try {
    // 타임스탬프 검증
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > maxAge) {
      console.error('Timestamp expired or invalid');
      return false;
    }

    // 서명 검증
    const message = JSON.stringify(data) + timestamp;
    const expectedSignature = crypto
      .createHmac('sha256', secretKey)
      .update(message)
      .digest('hex');

    // Timing-safe comparison
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (error) {
    console.error('HMAC signature verification failed:', error);
    return false;
  }
}

/**
 * 결제 요청 데이터 생성
 */
export interface PaymentRequestData {
  userId: string;
  contentId: number;
  contentName: string;
  price: number;
  userInfo: {
    name: string;
    gender: 'male' | 'female';
    birthDate: string;
    birthTime: string;
    calendarType: 'solar' | 'lunar' | 'lunar-leap';
  };
  partnerInfo?: {
    name: string;
    gender: 'male' | 'female';
    birthDate: string;
    birthTime: string;
    calendarType: 'solar' | 'lunar' | 'lunar-leap';
  };
  callbackUrl: string;
  returnUrl: string;
  cancelUrl: string;
}

/**
 * 포털에 결제 요청
 */
export async function requestPayment(
  paymentData: PaymentRequestData
): Promise<{ success: boolean; paymentUrl?: string; error?: string }> {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = generateHMACSignature(
      paymentData,
      PORTAL_SECRET_KEY,
      timestamp
    );

    const response = await fetch(`${PORTAL_API_URL}/api/payment/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': PORTAL_API_KEY,
        'X-Signature': signature,
        'X-Timestamp': timestamp.toString(),
      },
      body: JSON.stringify(paymentData),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || '결제 요청 실패',
      };
    }

    return {
      success: true,
      paymentUrl: data.paymentUrl,
    };
  } catch (error: any) {
    console.error('Payment request error:', error);
    return {
      success: false,
      error: error.message || '결제 요청 중 오류가 발생했습니다.',
    };
  }
}

/**
 * 결제 콜백 데이터 검증
 */
export interface PaymentCallbackData {
  paymentId: string;
  userId: string;
  contentId: number;
  status: 'completed' | 'failed' | 'cancelled';
  amount: number;
  paymentMethod?: string;
  transactionId?: string;
  timestamp: number;
}

export function verifyPaymentCallback(
  data: PaymentCallbackData,
  signature: string,
  timestamp: number
): boolean {
  return verifyHMACSignature(data, signature, PORTAL_SECRET_KEY, timestamp);
}










