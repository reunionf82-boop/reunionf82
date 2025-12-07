# 관리자 인증 시스템 설정 가이드

## 개요
관리자 페이지에 비밀번호 기반 인증 시스템을 추가했습니다. 관리 권한이 있는 사람만 업로드/수정할 수 있습니다.

## 환경 변수 설정

`.env.local` 파일에 다음을 추가하세요:

```env
ADMIN_PASSWORD=your_secure_password_here
```

**보안 참고:**
- 강력한 비밀번호를 사용하세요
- 프로덕션 환경에서는 반드시 Vercel 환경 변수에도 추가하세요

## Storage 정책 설정

Supabase SQL Editor에서 다음을 실행하세요:

```sql
-- 기존 정책 삭제
DROP POLICY IF EXISTS "Allow public read access" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow public updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes" ON storage.objects;

-- 공개 읽기만 허용 (업로드/수정/삭제는 API 라우트를 통해 서비스 롤 키로 처리)
CREATE POLICY "Allow public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'thumbnails');
```

또는 `supabase-storage-policies.sql` 파일을 실행하세요.

## 사용 방법

1. **관리자 로그인**
   - `/admin/login` 페이지로 이동
   - 환경 변수에 설정한 비밀번호 입력
   - 로그인 성공 시 `/admin` 페이지로 이동

2. **관리자 페이지 접근**
   - `/admin` 또는 `/admin/form` 접근 시 자동으로 인증 확인
   - 인증되지 않은 경우 `/admin/login`으로 리다이렉트

3. **로그아웃**
   - 관리자 페이지 우측 상단의 "로그아웃" 버튼 클릭

## 구현된 기능

### 1. 인증 API
- `POST /api/admin/auth/login` - 로그인
- `DELETE /api/admin/auth/login` - 로그아웃
- `GET /api/admin/auth/check` - 인증 상태 확인

### 2. 업로드 API
- `POST /api/admin/upload` - 썸네일 업로드 (서비스 롤 키 사용)

### 3. 보안
- 쿠키 기반 세션 관리 (httpOnly, secure)
- 서버 사이드에서만 서비스 롤 키 사용
- Storage 업로드는 API 라우트를 통해 처리 (RLS 우회)

## 파일 구조

```
app/
  admin/
    login/
      page.tsx          # 로그인 페이지
    page.tsx            # 관리자 목록 페이지 (인증 체크 추가)
    form/
      page.tsx          # 관리자 폼 페이지 (인증 체크 추가)
  api/
    admin/
      auth/
        login/
          route.ts      # 로그인/로그아웃 API
        check/
          route.ts      # 인증 확인 API
      upload/
        route.ts        # 썸네일 업로드 API (서비스 롤 키 사용)
lib/
  supabase-admin.ts     # uploadThumbnailFile 함수 수정 (API 라우트 사용)
```

## 주의사항

1. **비밀번호 보안**
   - 환경 변수에 저장된 비밀번호는 서버 사이드에서만 접근 가능
   - 클라이언트에 노출되지 않음

2. **세션 관리**
   - 쿠키는 httpOnly로 설정되어 JavaScript에서 접근 불가
   - 프로덕션 환경에서는 secure 플래그가 활성화됨

3. **Storage 정책**
   - 읽기는 공개로 허용 (모든 사용자가 썸네일을 볼 수 있음)
   - 업로드/수정/삭제는 API 라우트를 통해 서비스 롤 키로 처리




