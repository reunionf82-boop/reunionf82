-- Supabase RLS (Row Level Security) 정책 설정
-- Security Advisor 에러 해결을 위한 RLS 정책

-- ============================================
-- 1. app_settings 테이블 RLS 정책
-- ============================================

-- RLS 활성화
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- 읽기 정책: 모든 사용자가 읽기 가능 (공개 설정)
CREATE POLICY "Allow public read access to app_settings"
ON public.app_settings
FOR SELECT
TO public
USING (true);

-- 쓰기 정책: 인증된 사용자만 쓰기 가능 (서버 사이드에서만 사용)
-- 주의: 실제로는 서비스 롤 키를 사용하므로 이 정책은 선택사항
-- 서비스 롤 키는 RLS를 우회하므로 필요 없을 수 있음
CREATE POLICY "Allow authenticated users to update app_settings"
ON public.app_settings
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to insert app_settings"
ON public.app_settings
FOR INSERT
TO authenticated
WITH CHECK (true);

-- ============================================
-- 2. portal_results 테이블 RLS 정책
-- ============================================

-- RLS 활성화
ALTER TABLE public.portal_results ENABLE ROW LEVEL SECURITY;

-- 읽기 정책: 사용자는 자신의 데이터만 읽기 가능
-- user_id는 JWT 토큰에서 추출한 사용자 ID와 일치해야 함
CREATE POLICY "Users can view their own results"
ON public.portal_results
FOR SELECT
TO public
USING (
  -- user_id가 JWT의 sub (user ID)와 일치하는 경우만 허용
  -- 또는 서비스 롤 키를 사용하는 경우 (RLS 우회)
  auth.uid()::text = user_id::text
);

-- 쓰기 정책: 사용자는 자신의 데이터만 생성 가능
CREATE POLICY "Users can insert their own results"
ON public.portal_results
FOR INSERT
TO public
WITH CHECK (
  auth.uid()::text = user_id::text
);

-- 업데이트 정책: 사용자는 자신의 데이터만 업데이트 가능
CREATE POLICY "Users can update their own results"
ON public.portal_results
FOR UPDATE
TO public
USING (
  auth.uid()::text = user_id::text
)
WITH CHECK (
  auth.uid()::text = user_id::text
);

-- 삭제 정책: 사용자는 자신의 데이터만 삭제 가능
CREATE POLICY "Users can delete their own results"
ON public.portal_results
FOR DELETE
TO public
USING (
  auth.uid()::text = user_id::text
);

-- ============================================
-- 참고사항
-- ============================================

-- 1. portal_results 테이블의 user_id 컬럼이 UUID 타입인 경우:
--    auth.uid()::text = user_id::text 대신
--    auth.uid() = user_id 사용 가능

-- 2. 서비스 롤 키를 사용하는 경우:
--    서비스 롤 키는 RLS를 우회하므로 위 정책들이 적용되지 않습니다.
--    서버 사이드 API에서는 서비스 롤 키를 사용하여 RLS를 우회할 수 있습니다.

-- 3. portal_results가 JWT 토큰의 user_id를 사용하지 않는 경우:
--    (예: 외부 포털에서 토큰으로 user_id를 전달하는 경우)
--    다음 정책을 사용하세요:
/*
CREATE POLICY "Allow service role access to portal_results"
ON public.portal_results
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
*/

-- 4. 테이블 구조 확인:
--    portal_results 테이블에 user_id 컬럼이 있는지 확인하세요.
--    없다면 테이블 구조를 수정해야 합니다.

