# 포털 연동 가이드

## 개요
이 문서는 포털 사이트에서 2차 도메인으로 서브 페이지를 연동할 때 필요한 기술 사양과 보안 가이드를 제공합니다.

## 보안 고려사항

### 권장 연동 방식: JWT 토큰 + HMAC 서명

**이유:**
1. **JWT 토큰**: 사용자 정보를 안전하게 전달하고, 토큰 만료 시간으로 보안 강화
2. **HMAC 서명**: 요청의 무결성과 인증을 보장
3. **HTTPS 필수**: 모든 통신은 반드시 HTTPS로 진행
4. **토큰 만료 시간**: 짧은 유효 기간(예: 5분)으로 토큰 탈취 위험 최소화

---

## 1. 사용자 정보 연동

### 1.1 포털 → 서브 페이지 (사용자 정보 전달)

#### 방법 A: JWT 토큰 (권장)

**포털에서 서브 페이지로 리다이렉트 시:**

```
https://subdomain.example.com/form?title=서비스명&token=JWT_TOKEN
```

**JWT 토큰 구조:**
```json
{
  "userId": "portal_user_12345",
  "name": "홍길동",
  "gender": "male",  // "male" | "female"
  "birthDate": "1990-01-15",
  "birthTime": "14:30",  // HH:mm 형식
  "calendarType": "solar",  // "solar" | "lunar" | "lunar-leap"
  "contentId": 1,  // 선택한 서비스 ID
  "iat": 1234567890,  // 발급 시간
  "exp": 1234568190   // 만료 시간 (5분 후)
}
```

**JWT 서명:**
- 알고리즘: `HS256`
- Secret Key: 포털과 서브 페이지가 공유하는 비밀 키 (환경 변수로 관리)

#### 방법 B: 암호화된 URL 파라미터 (대안)

```
https://subdomain.example.com/form?title=서비스명&data=ENCRYPTED_DATA&signature=HMAC_SIGNATURE
```

**암호화 데이터 구조:**
```json
{
  "userId": "portal_user_12345",
  "name": "홍길동",
  "gender": "male",
  "birthDate": "1990-01-15",
  "birthTime": "14:30",
  "calendarType": "solar",
  "contentId": 1,
  "timestamp": 1234567890
}
```

**HMAC 서명 생성:**
```javascript
const crypto = require('crypto');
const data = JSON.stringify(userData);
const signature = crypto
  .createHmac('sha256', SECRET_KEY)
  .update(data)
  .digest('hex');
```

---

## 2. 결제 연동

### 2.1 결제 요청 (서브 페이지 → 포털)

**API 엔드포인트:**
```
POST https://portal.example.com/api/payment/request
```

**요청 헤더:**
```
Content-Type: application/json
X-API-Key: YOUR_API_KEY
X-Signature: HMAC_SIGNATURE
X-Timestamp: 1234567890
```

**요청 본문:**
```json
{
  "userId": "portal_user_12345",
  "contentId": 1,
  "contentName": "재회 성공률 점사",
  "price": 9900,
  "userInfo": {
    "name": "홍길동",
    "gender": "male",
    "birthDate": "1990-01-15",
    "birthTime": "14:30",
    "calendarType": "solar"
  },
  "partnerInfo": {  // 궁합형인 경우만
    "name": "김영희",
    "gender": "female",
    "birthDate": "1992-05-20",
    "birthTime": "10:15",
    "calendarType": "solar"
  },
  "callbackUrl": "https://subdomain.example.com/api/payment/callback",
  "returnUrl": "https://subdomain.example.com/form?payment=success",
  "cancelUrl": "https://subdomain.example.com/form?payment=cancel",
  "timestamp": 1234567890
}
```

**HMAC 서명 생성:**
```javascript
const crypto = require('crypto');

function generateSignature(data, secretKey, timestamp) {
  const message = JSON.stringify(data) + timestamp;
  return crypto
    .createHmac('sha256', secretKey)
    .update(message)
    .digest('hex');
}
```

**응답:**
```json
{
  "success": true,
  "paymentId": "payment_12345",
  "paymentUrl": "https://portal.example.com/payment/mobilians?paymentId=payment_12345",
  "expiresAt": 1234568190
}
```

### 2.2 결제 완료 콜백 (포털 → 서브 페이지)

**웹훅 엔드포인트:**
```
POST https://subdomain.example.com/api/payment/callback
```

**요청 헤더:**
```
Content-Type: application/json
X-Portal-Signature: HMAC_SIGNATURE
X-Portal-Timestamp: 1234567890
```

**요청 본문:**
```json
{
  "paymentId": "payment_12345",
  "userId": "portal_user_12345",
  "contentId": 1,
  "status": "completed",  // "completed" | "failed" | "cancelled"
  "amount": 9900,
  "paymentMethod": "card",
  "transactionId": "mobilians_txn_12345",
  "timestamp": 1234567890
}
```

**서명 검증:**
```javascript
function verifySignature(data, signature, secretKey, timestamp) {
  // 타임스탬프 검증 (5분 이내)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) {
    return false; // 타임스탬프 만료
  }
  
  // 서명 검증
  const message = JSON.stringify(data) + timestamp;
  const expectedSignature = crypto
    .createHmac('sha256', secretKey)
    .update(message)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

---

## 3. 구현 예시

### 3.1 서브 페이지에서 사용자 정보 수신

**파일: `app/form/page.tsx`**

```typescript
useEffect(() => {
  // JWT 토큰 방식
  const token = searchParams.get('token');
  if (token) {
    try {
      // JWT 검증 및 디코딩
      const decoded = verifyJWT(token);
      setName(decoded.name);
      setGender(decoded.gender);
      setYear(decoded.birthDate.split('-')[0]);
      setMonth(decoded.birthDate.split('-')[1]);
      setDay(decoded.birthDate.split('-')[2]);
      setBirthHour(decoded.birthTime);
      setCalendarType(decoded.calendarType);
      
      // 자동 입력된 필드는 읽기 전용으로 설정
      setFormLocked(true);
    } catch (error) {
      console.error('토큰 검증 실패:', error);
      alert('유효하지 않은 접근입니다.');
    }
  }
}, [searchParams]);
```

### 3.2 결제 요청 API

**파일: `app/api/payment/request/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const PORTAL_API_URL = process.env.PORTAL_API_URL || '';
const PORTAL_API_KEY = process.env.PORTAL_API_KEY || '';
const PORTAL_SECRET_KEY = process.env.PORTAL_SECRET_KEY || '';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // HMAC 서명 생성
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = generateSignature(body, PORTAL_SECRET_KEY, timestamp);
    
    // 포털에 결제 요청
    const response = await fetch(`${PORTAL_API_URL}/api/payment/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': PORTAL_API_KEY,
        'X-Signature': signature,
        'X-Timestamp': timestamp.toString(),
      },
      body: JSON.stringify(body),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return NextResponse.json(
        { error: '결제 요청 실패', details: data },
        { status: response.status }
      );
    }
    
    // 결제 페이지로 리다이렉트
    return NextResponse.json({
      success: true,
      paymentUrl: data.paymentUrl,
    });
  } catch (error: any) {
    console.error('결제 요청 오류:', error);
    return NextResponse.json(
      { error: '결제 요청 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

function generateSignature(data: any, secretKey: string, timestamp: number): string {
  const message = JSON.stringify(data) + timestamp;
  return crypto
    .createHmac('sha256', secretKey)
    .update(message)
    .digest('hex');
}
```

### 3.3 결제 완료 콜백 처리

**파일: `app/api/payment/callback/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const PORTAL_SECRET_KEY = process.env.PORTAL_SECRET_KEY || '';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const signature = request.headers.get('X-Portal-Signature') || '';
    const timestamp = parseInt(request.headers.get('X-Portal-Timestamp') || '0');
    
    // 서명 검증
    if (!verifySignature(body, signature, PORTAL_SECRET_KEY, timestamp)) {
      return NextResponse.json(
        { error: '서명 검증 실패' },
        { status: 401 }
      );
    }
    
    // 결제 상태 확인
    if (body.status === 'completed') {
      // 결제 완료 처리
      // - 사용자 정보를 sessionStorage에 저장
      // - AI 생성 프로세스 시작
      // - 결과 페이지로 리다이렉트
      
      return NextResponse.json({ success: true });
    } else {
      // 결제 실패 또는 취소
      return NextResponse.json({ success: false, status: body.status });
    }
  } catch (error: any) {
    console.error('결제 콜백 오류:', error);
    return NextResponse.json(
      { error: '콜백 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

function verifySignature(
  data: any,
  signature: string,
  secretKey: string,
  timestamp: number
): boolean {
  // 타임스탬프 검증 (5분 이내)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) {
    return false;
  }
  
  // 서명 검증
  const message = JSON.stringify(data) + timestamp;
  const expectedSignature = crypto
    .createHmac('sha256', secretKey)
    .update(message)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

---

## 4. 환경 변수 설정

**파일: `.env.local`**

```bash
# 포털 연동 설정
PORTAL_API_URL=https://portal.example.com
PORTAL_API_KEY=your_api_key_here
PORTAL_SECRET_KEY=your_secret_key_here

# JWT 설정
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=300  # 5분
```

---

## 5. 보안 체크리스트

- [ ] 모든 통신은 HTTPS 사용
- [ ] JWT 토큰 만료 시간 설정 (5분 이내)
- [ ] HMAC 서명으로 모든 요청 검증
- [ ] 타임스탬프 검증 (5분 이내)
- [ ] API 키는 환경 변수로 관리
- [ ] CORS 설정 (필요한 도메인만 허용)
- [ ] Rate Limiting 적용
- [ ] 로그에 민감 정보 기록 금지
- [ ] 정기적인 보안 감사

---

## 6. 에러 처리

### 일반적인 에러 코드

| 코드 | 설명 | 처리 방법 |
|------|------|----------|
| 401 | 인증 실패 | 토큰 재발급 요청 |
| 403 | 권한 없음 | 포털에 문의 |
| 400 | 잘못된 요청 | 요청 데이터 검증 |
| 500 | 서버 오류 | 재시도 또는 고객 지원 |

---

## 7. 테스트 방법

### 7.1 로컬 테스트

```bash
# JWT 토큰 생성 테스트
node scripts/generate-test-token.js

# 결제 요청 테스트
curl -X POST http://localhost:3000/api/payment/request \
  -H "Content-Type: application/json" \
  -d '{"userId": "test_user", ...}'
```

### 7.2 스테이징 환경 테스트

1. 포털 스테이징 환경에서 JWT 토큰 발급
2. 서브 페이지로 리다이렉트 테스트
3. 결제 요청 → 모빌리언스 테스트 결제 → 콜백 수신 확인

---

## 8. 연동 순서도

```
1. 사용자가 포털에서 서비스 선택
   ↓
2. 포털에서 JWT 토큰 생성 (사용자 정보 포함)
   ↓
3. 서브 페이지로 리다이렉트 (토큰 포함)
   ↓
4. 서브 페이지에서 토큰 검증 및 사용자 정보 자동 입력
   ↓
5. 사용자가 "결제하기" 클릭
   ↓
6. 서브 페이지 → 포털 결제 요청 API 호출
   ↓
7. 포털 → 모빌리언스 결제 처리
   ↓
8. 결제 완료 후 포털 → 서브 페이지 웹훅 콜백
   ↓
9. 서브 페이지에서 AI 생성 시작
   ↓
10. 결과 페이지 표시
```

---

## 9. 추가 고려사항

### 9.1 세션 관리
- 결제 완료 후 사용자 정보는 `sessionStorage`에 저장
- 결과 페이지에서 사용

### 9.2 재시도 로직
- 결제 요청 실패 시 최대 3회 재시도
- 지수 백오프 적용

### 9.3 모니터링
- 결제 요청/콜백 로그 기록
- 실패율 모니터링
- 알림 설정

---

# 포털 연동 설정 (선택사항)
PORTAL_API_URL=https://portal.example.com
PORTAL_API_KEY=your_portal_api_key
PORTAL_SECRET_KEY=your_portal_secret_key
JWT_SECRET=your_jwt_secret_key
NEXT_PUBLIC_BASE_URL=https://subdomain.example.com










