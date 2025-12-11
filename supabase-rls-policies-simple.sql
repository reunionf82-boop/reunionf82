-- Supabase RLS 정책 (간단 버전)
-- Security Advisor 에러 해결용

-- ============================================
-- app_settings 테이블
-- ============================================

-- RLS 활성화
ALTER TABLE IF EXISTS public.app_settings ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제 (있는 경우)
DROP POLICY IF EXISTS "Allow public read access to app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Allow authenticated users to update app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Allow authenticated users to insert app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Allow authenticated users to delete app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Allow authenticated users to modify app_settings" ON public.app_settings;

-- 읽기: 모든 사용자 허용
CREATE POLICY "Allow public read access to app_settings"
ON public.app_settings
FOR SELECT
TO public
USING (true);

-- 쓰기: 인증된 사용자 허용 (SELECT 제외하여 중복 정책 경고 방지)
-- SELECT는 위의 "Allow public read access" 정책으로 처리됨
-- 각 액션별로 별도 정책 생성
CREATE POLICY "Allow authenticated users to insert app_settings"
ON public.app_settings
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update app_settings"
ON public.app_settings
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete app_settings"
ON public.app_settings
FOR DELETE
TO authenticated
USING (true);

-- ============================================
-- contents 테이블
-- ============================================

-- RLS 활성화
ALTER TABLE IF EXISTS public.contents ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제 (있는 경우)
DROP POLICY IF EXISTS "Allow public read access to contents" ON public.contents;
DROP POLICY IF EXISTS "Allow authenticated users to insert contents" ON public.contents;
DROP POLICY IF EXISTS "Allow authenticated users to update contents" ON public.contents;
DROP POLICY IF EXISTS "Allow authenticated users to delete contents" ON public.contents;
DROP POLICY IF EXISTS "Allow authenticated users to modify contents" ON public.contents;

-- 읽기: 모든 사용자 허용 (공개 컨텐츠)
CREATE POLICY "Allow public read access to contents"
ON public.contents
FOR SELECT
TO public
USING (true);

-- 쓰기: 인증된 사용자 허용 (SELECT 제외하여 중복 정책 경고 방지)
-- SELECT는 위의 "Allow public read access" 정책으로 처리됨
-- 각 액션별로 별도 정책 생성
CREATE POLICY "Allow authenticated users to insert contents"
ON public.contents
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update contents"
ON public.contents
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete contents"
ON public.contents
FOR DELETE
TO authenticated
USING (true);

-- ============================================
-- portal_results 테이블
-- ============================================

-- RLS 활성화
ALTER TABLE IF EXISTS public.portal_results ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제 (있는 경우)
DROP POLICY IF EXISTS "Users can view their own results" ON public.portal_results;
DROP POLICY IF EXISTS "Users can insert their own results" ON public.portal_results;
DROP POLICY IF EXISTS "Users can update their own results" ON public.portal_results;
DROP POLICY IF EXISTS "Users can delete their own results" ON public.portal_results;
DROP POLICY IF EXISTS "Allow service role access to portal_results" ON public.portal_results;
DROP POLICY IF EXISTS "Users can access their own results" ON public.portal_results;
DROP POLICY IF EXISTS "Allow public access to portal_results" ON public.portal_results;

-- 옵션 1: JWT 기반 인증 사용 시 (user_id가 auth.uid()와 일치)
-- 이 정책을 사용하려면 주석을 해제하세요
/*
CREATE POLICY "Users can access their own results"
ON public.portal_results
FOR ALL
TO public
USING (auth.uid()::text = user_id::text)
WITH CHECK (auth.uid()::text = user_id::text);
*/

-- 옵션 2: 서비스 롤 키 사용 시 (서버 사이드 API에서만 접근)
-- 서비스 롤 키는 RLS를 우회하므로 이 정책은 선택사항
-- 하지만 Security Advisor 경고를 해결하려면 필요합니다
CREATE POLICY "Allow service role access to portal_results"
ON public.portal_results
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 옵션 3: 완전 공개 (개발/테스트용, 프로덕션에서는 비권장)
-- 주의: 이 정책은 모든 사용자가 모든 데이터에 접근할 수 있습니다
/*
CREATE POLICY "Allow public access to portal_results"
ON public.portal_results
FOR ALL
TO public
USING (true)
WITH CHECK (true);
*/

-- ============================================
-- 정책 확인 쿼리
-- ============================================

-- 생성된 정책 확인
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('app_settings', 'contents', 'portal_results')
ORDER BY tablename, policyname;

