-- Supabase RLS 정책 초기화 및 재생성
-- 기존 정책을 모두 삭제하고 새로 생성합니다

-- ============================================
-- 1. 기존 정책 모두 삭제
-- ============================================

-- app_settings 테이블 정책 삭제
DROP POLICY IF EXISTS "Allow public read access to app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Allow authenticated users to update app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Allow authenticated users to insert app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Allow authenticated users to modify app_settings" ON public.app_settings;

-- contents 테이블 정책 삭제
DROP POLICY IF EXISTS "Allow public read access to contents" ON public.contents;
DROP POLICY IF EXISTS "Allow authenticated users to modify contents" ON public.contents;

-- portal_results 테이블 정책 삭제
DROP POLICY IF EXISTS "Users can view their own results" ON public.portal_results;
DROP POLICY IF EXISTS "Users can insert their own results" ON public.portal_results;
DROP POLICY IF EXISTS "Users can update their own results" ON public.portal_results;
DROP POLICY IF EXISTS "Users can delete their own results" ON public.portal_results;
DROP POLICY IF EXISTS "Allow service role access to portal_results" ON public.portal_results;
DROP POLICY IF EXISTS "Users can access their own results" ON public.portal_results;
DROP POLICY IF EXISTS "Allow public access to portal_results" ON public.portal_results;

-- ============================================
-- 2. RLS 활성화
-- ============================================

ALTER TABLE IF EXISTS public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.portal_results ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. 새 정책 생성
-- ============================================

-- app_settings 테이블 정책
CREATE POLICY "Allow public read access to app_settings"
ON public.app_settings
FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow authenticated users to modify app_settings"
ON public.app_settings
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- contents 테이블 정책
CREATE POLICY "Allow public read access to contents"
ON public.contents
FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow authenticated users to modify contents"
ON public.contents
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- portal_results 테이블 정책
CREATE POLICY "Allow service role access to portal_results"
ON public.portal_results
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================
-- 4. 정책 확인
-- ============================================

SELECT 
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('app_settings', 'contents', 'portal_results')
ORDER BY tablename, policyname;







