# Supabase Edge Function으로 Jeminai API 마이그레이션 가이드

## 개요

Vercel의 5분(300초) 타임아웃 제한을 해결하기 위해 Jeminai API를 Supabase Edge Functions로 마이그레이션했습니다.
Supabase Edge Functions는 Paid 플랜에서 최대 400초(6분 40초)까지 실행 가능합니다.

## 변경 사항

1. **새로운 Supabase Edge Function 생성**: `supabase/functions/jeminai/index.ts`
2. **클라이언트 코드 수정**: `lib/jeminai.ts`에서 Supabase Edge Function 호출
3. **타임아웃 설정 변경**: 300초 → 400초 (380초에서 부분 완료 처리)

## 배포 방법

### 1. Supabase CLI 설치 및 로그인

```bash
# Supabase CLI 설치 (이미 설치되어 있다면 생략)
npm install -g supabase

# Supabase에 로그인
supabase login

# 프로젝트 연결
supabase link --project-ref your-project-ref
```

### 2. 환경 변수 설정

Supabase Dashboard에서 Edge Function 환경 변수를 설정해야 합니다:

**방법 1: Supabase Dashboard 사용**
1. Supabase Dashboard 접속
2. 왼쪽 메뉴에서 **Edge Functions** 클릭
3. **Settings** 또는 **Secrets** 탭 이동
4. **Secrets** 섹션에서 다음 환경 변수 추가:
   - Key: `GEMINI_API_KEY`
   - Value: Google Gemini API 키 (기존 `NEXT_PUBLIC_JEMINAI_API_URL` 값)

**방법 2: Supabase CLI 사용 (추천)**
```bash
# 프로젝트 연결 (아직 안 했다면)
supabase link --project-ref your-project-ref

# 환경 변수 설정
supabase secrets set GEMINI_API_KEY=your-gemini-api-key-here
```

**⚠️ 중요**: 
- "API Keys" 페이지가 **아닙니다** (그곳은 Supabase 자체 API 키 관리 페이지)
- **Edge Functions → Settings/Secrets**에서 환경 변수를 추가해야 합니다

### 3. Edge Function 배포

```bash
# jeminai Edge Function 배포
supabase functions deploy jeminai

# 또는 모든 함수 배포
supabase functions deploy
```

### 4. 클라이언트 환경 변수 확인

`.env.local` 파일에 다음 환경 변수가 설정되어 있는지 확인:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## 테스트

1. 개발 서버 실행:
   ```bash
   npm run dev
   ```

2. 점사 기능 테스트:
   - 점사 요청이 정상적으로 작동하는지 확인
   - 380초 경과 시 2차 요청이 자동으로 시작되는지 확인
   - 2차 요청에서 완료된 소제목이 건너뛰어지는지 확인

## 주요 변경 사항

### 타임아웃 설정
- **이전**: 300초 (Vercel 제한)
- **현재**: 400초 (Supabase Edge Function 제한)
- **부분 완료 처리**: 380초 경과 시 자동으로 2차 요청 시작

### API 엔드포인트
- **이전**: `/api/jeminai` (Vercel API Route)
- **현재**: `${SUPABASE_URL}/functions/v1/jeminai` (Supabase Edge Function)

### 인증
- Supabase Edge Function은 `Authorization: Bearer ${SUPABASE_ANON_KEY}` 헤더로 인증합니다.

## 문제 해결

### 1. "GEMINI_API_KEY 환경 변수가 설정되지 않았습니다" 에러
- Supabase Dashboard에서 Edge Function 환경 변수를 확인하세요.
- `GEMINI_API_KEY`가 올바르게 설정되어 있는지 확인하세요.

### 2. CORS 에러
- `supabase/config.toml`에서 `jeminai` 함수의 `verify_jwt = false` 설정을 확인하세요.

### 3. 타임아웃 에러
- Supabase Pro 플랜 이상을 사용 중인지 확인하세요 (Free 플랜은 150초 제한).
- 400초 제한 내에서 작업이 완료되는지 확인하세요.

## 비용

- **Supabase Pro**: 월 $25 (400초 타임아웃)
- **Vercel Pro**: 월 $20 (300초 타임아웃)

Supabase Pro로 업그레이드하면 100초 더 긴 타임아웃을 사용할 수 있습니다.

## 다음 단계

만약 400초도 부족하다면:
1. 별도 서버(Cloudways, AWS Lambda 등)로 분리 고려
2. 점사 로직 최적화 (더 짧은 프롬프트, 더 효율적인 처리)
