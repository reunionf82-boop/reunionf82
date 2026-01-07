-- Supabase RLS 정책 워닝 해결 (9개)
-- "USING (true)" 또는 "WITH CHECK (true)"를 더 구체적인 조건으로 변경
-- Security Advisor 경고: "Detects RLS policies that use overly permissive expressions"

-- ============================================
-- 1. app_settings 테이블 (3개 워닝)
-- ===========================================

-- 기존 정책 삭제
DROP POLICY IF EXISTS "Allow authenticated users to insert app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Allow authenticated users to update app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Allow authenticated users to delete app_settings" ON public.app_settings;

-- INSERT 정책 재생성 (auth.uid() IS NOT NULL 사용)
CREATE POLICY "Allow authenticated users to insert app_settings"
ON public.app_settings
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE 정책 재생성
CREATE POLICY "Allow authenticated users to update app_settings"
ON public.app_settings
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- DELETE 정책 재생성
CREATE POLICY "Allow authenticated users to delete app_settings"
ON public.app_settings
FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL);

-- ============================================
-- 2. contents 테이블 (3개 워닝)
-- ===========================================

-- 기존 정책 삭제
DROP POLICY IF EXISTS "Allow authenticated users to insert contents" ON public.contents;
DROP POLICY IF EXISTS "Allow authenticated users to update contents" ON public.contents;
DROP POLICY IF EXISTS "Allow authenticated users to delete contents" ON public.contents;

-- INSERT 정책 재생성
CREATE POLICY "Allow authenticated users to insert contents"
ON public.contents
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE 정책 재생성
CREATE POLICY "Allow authenticated users to update contents"
ON public.contents
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- DELETE 정책 재생성
CREATE POLICY "Allow authenticated users to delete contents"
ON public.contents
FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL);

-- ============================================
-- 3. saved_results 테이블 (2개 워닝)
-- ===========================================

-- RLS 활성화 확인
ALTER TABLE IF EXISTS public.saved_results ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제
DROP POLICY IF EXISTS "Allow all users to insert saved_results" ON public.saved_results;
DROP POLICY IF EXISTS "Allow all users to update saved_results" ON public.saved_results;
DROP POLICY IF EXISTS "Allow all users to delete saved_results" ON public.saved_results;

-- INSERT 정책 재생성 (인증된 사용자 또는 서비스 롤)
CREATE POLICY "Allow authenticated users to insert saved_results"
ON public.saved_results
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE 정책 재생성 (인증된 사용자만 자신의 데이터 수정 가능하도록)
-- 주의: saved_results에 user_id 컬럼이 있다면 더 구체적인 조건 사용 가능
CREATE POLICY "Allow authenticated users to update saved_results"
ON public.saved_results
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- DELETE 정책 재생성
CREATE POLICY "Allow authenticated users to delete saved_results"
ON public.saved_results
FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL);

-- ============================================
-- 4. temp_requests 테이블 (1개 워닝)
-- ===========================================

-- RLS 활성화 확인
ALTER TABLE IF EXISTS public.temp_requests ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제
DROP POLICY IF EXISTS "Allow all operations for service role" ON public.temp_requests;

-- 모든 작업 정책 재생성 (인증된 사용자 또는 서비스 롤)
CREATE POLICY "Allow authenticated users to access temp_requests"
ON public.temp_requests
FOR ALL
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================
-- 정책 확인
-- ===========================================

SELECT 
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('app_settings', 'contents', 'saved_results', 'temp_requests')
ORDER BY tablename, policyname;
