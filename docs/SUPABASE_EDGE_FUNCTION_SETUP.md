# Supabase Edge Function PDF 생성 설정 가이드

## 개요

PDF 생성 기능을 Vercel serverless 함수에서 Supabase Edge Functions로 이동했습니다.
Supabase Edge Functions는 Deno 런타임을 사용하며, Puppeteer를 안정적으로 실행할 수 있습니다.

## 사전 요구사항

1. Supabase CLI 설치 (이미 설치되어 있다면 생략)
   - Windows: Scoop 또는 Chocolatey 사용
   - 참고: `docs/SUPABASE_CLI_INSTALL.md`

2. Supabase 프로젝트 연결
   ```bash
   supabase login
   supabase link --project-ref your-project-ref
   ```

## Edge Function 배포

### 1. 로컬에서 테스트

```bash
# Supabase 로컬 개발 환경 시작
supabase start

# Edge Function 로컬 실행
supabase functions serve generate-pdf
```

### 2. 프로덕션 배포

```bash
# Edge Function 배포
supabase functions deploy generate-pdf
```

### 3. 환경 변수 설정

Supabase 대시보드에서 Edge Function 환경 변수 설정:

1. Supabase 대시보드 → Edge Functions → generate-pdf → Settings
2. 다음 환경 변수 추가:
   - `SUPABASE_URL`: Supabase 프로젝트 URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase 서비스 롤 키

또는 CLI로 설정:

```bash
supabase secrets set SUPABASE_URL=your_supabase_url
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## 클라이언트 코드 변경사항

`app/result/page.tsx`에서 PDF 생성 API 호출이 Supabase Edge Function을 사용하도록 변경되었습니다:

```typescript
const edgeFunctionUrl = `${supabaseUrl}/functions/v1/generate-pdf`
const generateResponse = await fetch(edgeFunctionUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${supabaseAnonKey}`,
  },
  body: JSON.stringify({
    savedResultId,
    html: `<style>${styleContent}</style>${htmlContent}`,
    contentName: content?.content_name || '재회 결과',
    thumbnailUrl: content?.thumbnail_url || null
  })
})
```

## 문제 해결

### Puppeteer 실행 실패

Supabase Edge Functions는 Deno 런타임을 사용하므로, Deno용 Puppeteer를 사용합니다.
만약 Puppeteer가 실행되지 않는다면:

1. Edge Function 로그 확인:
   ```bash
   supabase functions logs generate-pdf
   ```

2. Deno Puppeteer 버전 확인:
   - 현재 사용: `https://deno.land/x/puppeteer@16.2.0/mod.ts`
   - 최신 버전 확인: https://deno.land/x/puppeteer

### 환경 변수 오류

환경 변수가 설정되지 않았다는 오류가 발생하면:

1. Supabase 대시보드에서 환경 변수 확인
2. CLI로 환경 변수 재설정:
   ```bash
   supabase secrets list
   supabase secrets set SUPABASE_URL=your_url
   ```

## 기존 Vercel API 라우트

기존 `app/api/saved-results/generate-pdf/route.ts`는 유지되지만, 클라이언트에서는 더 이상 사용되지 않습니다.
필요시 삭제할 수 있습니다.
