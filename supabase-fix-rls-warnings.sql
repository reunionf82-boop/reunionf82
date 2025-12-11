-- Supabase RLS 정책 중복 경고 해결
-- app_settings와 contents 테이블의 SELECT 액션에 대한 중복 정책 제거

-- ============================================
-- app_settings 테이블 정책 수정
-- ============================================

-- 기존 정책 삭제
DROP POLICY IF EXISTS "Allow authenticated users to modify app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Allow authenticated users to insert app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Allow authenticated users to update app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Allow authenticated users to delete app_settings" ON public.app_settings;

-- SELECT 제외한 쓰기 정책 재생성 (중복 경고 방지)
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
-- contents 테이블 정책 수정
-- ============================================

-- 기존 정책 삭제
DROP POLICY IF EXISTS "Allow authenticated users to modify contents" ON public.contents;
DROP POLICY IF EXISTS "Allow authenticated users to insert contents" ON public.contents;
DROP POLICY IF EXISTS "Allow authenticated users to update contents" ON public.contents;
DROP POLICY IF EXISTS "Allow authenticated users to delete contents" ON public.contents;

-- SELECT 제외한 쓰기 정책 재생성 (중복 경고 방지)
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
-- 정책 확인
-- ============================================

SELECT 
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('app_settings', 'contents')
ORDER BY tablename, policyname;

