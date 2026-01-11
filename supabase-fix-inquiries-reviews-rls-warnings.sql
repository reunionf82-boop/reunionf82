-- Supabase RLS 경고 수정: inquiries 및 reviews 테이블
-- Security Advisor "RLS Policy Always True" 경고 해결

-- ============================================
-- 1. inquiries 테이블 RLS 정책 수정
-- ============================================

-- RLS 활성화 확인
ALTER TABLE IF EXISTS public.inquiries ENABLE ROW LEVEL SECURITY;

-- 기존 UPDATE/DELETE 정책 모두 삭제 (있는 경우)
-- 모든 역할에 대한 UPDATE/DELETE 정책 삭제

-- 1단계: 실제 존재하는 모든 UPDATE/DELETE 정책 확인 및 삭제
-- pg_policies 뷰와 pg_policy 테이블 모두 확인하여 완전히 삭제
DO $$
DECLARE
    r RECORD;
    policy_name TEXT;
BEGIN
    -- inquiries 테이블의 모든 UPDATE 정책 삭제 (pg_policies 뷰에서)
    FOR r IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'inquiries' 
          AND cmd = 'UPDATE'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.inquiries', r.policyname);
        RAISE NOTICE 'Deleted UPDATE policy (from pg_policies): %', r.policyname;
    END LOOP;
    
    -- inquiries 테이블의 모든 DELETE 정책 삭제 (pg_policies 뷰에서)
    FOR r IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'inquiries' 
          AND cmd = 'DELETE'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.inquiries', r.policyname);
        RAISE NOTICE 'Deleted DELETE policy (from pg_policies): %', r.policyname;
    END LOOP;
    
    -- pg_policy 테이블에서 직접 확인 (pg_policies 뷰에 없는 경우 대비)
    FOR r IN 
        SELECT pol.polname as policyname
        FROM pg_policy pol
        JOIN pg_class pc ON pol.polrelid = pc.oid
        JOIN pg_namespace pn ON pc.relnamespace = pn.oid
        WHERE pn.nspname = 'public'
          AND pc.relname = 'inquiries'
          AND pol.polcmd IN ('u', 'd') -- 'u' = UPDATE, 'd' = DELETE
    LOOP
        BEGIN
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.inquiries', r.policyname);
            RAISE NOTICE 'Deleted policy (from pg_policy): %', r.policyname;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Failed to delete policy %: %', r.policyname, SQLERRM;
        END;
    END LOOP;
END $$;

-- 참고: service_role은 RLS를 우회하므로 별도 정책이 필요 없습니다.
-- 서버 사이드 API에서 서비스 롤 키를 사용하면 자동으로 RLS를 우회합니다.
-- 따라서 UPDATE/DELETE 정책을 만들지 않는 것이 Security Advisor 경고를 해결하는 가장 좋은 방법입니다.

-- INSERT 정책 수정: WITH CHECK (true) 대신 구체적인 조건 사용
-- Security Advisor 경고 해결을 위해 더 구체적인 조건으로 변경
DROP POLICY IF EXISTS "Allow public to insert inquiries" ON public.inquiries;
CREATE POLICY "Allow public to insert inquiries"
ON public.inquiries
FOR INSERT
TO public
WITH CHECK (
  -- 필수 필드 검증으로 더 구체적인 조건 사용
  name IS NOT NULL 
  AND LENGTH(TRIM(name)) > 0
  AND phone IS NOT NULL 
  AND LENGTH(TRIM(phone)) > 0
  AND email IS NOT NULL 
  AND LENGTH(TRIM(email)) > 0
  AND content IS NOT NULL 
  AND LENGTH(TRIM(content)) > 0
  AND LENGTH(TRIM(content)) <= 800 -- content 최대 길이 제한
);

-- ============================================
-- 2. reviews 테이블 RLS 정책 수정
-- ============================================

-- RLS 활성화 확인
ALTER TABLE IF EXISTS public.reviews ENABLE ROW LEVEL SECURITY;

-- 기존 UPDATE/DELETE 정책 모두 삭제 (있는 경우)
-- 모든 역할에 대한 UPDATE/DELETE 정책 삭제

-- 1단계: 실제 존재하는 모든 UPDATE/DELETE 정책 확인 및 삭제
-- pg_policies 뷰와 pg_policy 테이블 모두 확인하여 완전히 삭제
DO $$
DECLARE
    r RECORD;
    policy_name TEXT;
BEGIN
    -- reviews 테이블의 모든 UPDATE 정책 삭제 (pg_policies 뷰에서)
    FOR r IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'reviews' 
          AND cmd = 'UPDATE'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.reviews', r.policyname);
        RAISE NOTICE 'Deleted UPDATE policy (from pg_policies): %', r.policyname;
    END LOOP;
    
    -- reviews 테이블의 모든 DELETE 정책 삭제 (pg_policies 뷰에서)
    FOR r IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'reviews' 
          AND cmd = 'DELETE'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.reviews', r.policyname);
        RAISE NOTICE 'Deleted DELETE policy (from pg_policies): %', r.policyname;
    END LOOP;
    
    -- pg_policy 테이블에서 직접 확인 (pg_policies 뷰에 없는 경우 대비)
    FOR r IN 
        SELECT pol.polname as policyname
        FROM pg_policy pol
        JOIN pg_class pc ON pol.polrelid = pc.oid
        JOIN pg_namespace pn ON pc.relnamespace = pn.oid
        WHERE pn.nspname = 'public'
          AND pc.relname = 'reviews'
          AND pol.polcmd IN ('u', 'd') -- 'u' = UPDATE, 'd' = DELETE
    LOOP
        BEGIN
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.reviews', r.policyname);
            RAISE NOTICE 'Deleted policy (from pg_policy): %', r.policyname;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Failed to delete policy %: %', r.policyname, SQLERRM;
        END;
    END LOOP;
END $$;

-- 참고: service_role은 RLS를 우회하므로 별도 정책이 필요 없습니다.
-- 서버 사이드 API에서 서비스 롤 키를 사용하면 자동으로 RLS를 우회합니다.
-- 따라서 UPDATE/DELETE 정책을 만들지 않는 것이 Security Advisor 경고를 해결하는 가장 좋은 방법입니다.

-- INSERT 정책 수정: WITH CHECK (true) 대신 구체적인 조건 사용
-- Security Advisor 경고 해결을 위해 더 구체적인 조건으로 변경
DROP POLICY IF EXISTS "Allow public to insert reviews" ON public.reviews;
CREATE POLICY "Allow public to insert reviews"
ON public.reviews
FOR INSERT
TO public
WITH CHECK (
  -- 필수 필드 검증으로 더 구체적인 조건 사용
  content_id IS NOT NULL
  AND content_id > 0
  AND review_text IS NOT NULL
  AND LENGTH(TRIM(review_text)) > 0
  AND LENGTH(TRIM(review_text)) <= 3000 -- review_text 최대 길이 제한
  -- image_url은 선택사항이므로 검증하지 않음
);

-- service_role INSERT 정책은 유지 (서비스 롤은 RLS를 우회하지만 정책이 있으면 경고가 발생할 수 있음)
-- 필요시 삭제 가능
DROP POLICY IF EXISTS "Allow service role to insert reviews" ON public.reviews;

-- 기존 SELECT 정책은 유지
-- SELECT: supabase-add-reviews-and-click-count.sql에 정의

-- ============================================
-- 3. 정책 확인 쿼리
-- ============================================

-- inquiries 테이블 정책 확인
SELECT 
  tablename, 
  policyname, 
  cmd, 
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'inquiries'
ORDER BY cmd, policyname;

-- reviews 테이블 정책 확인
SELECT 
  tablename, 
  policyname, 
  cmd, 
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'reviews'
ORDER BY cmd, policyname;

-- ============================================
-- 4. Security Advisor 경고 확인용 쿼리
-- ============================================

-- UPDATE/DELETE 정책이 있는지 최종 확인 (pg_policies 뷰)
-- 이 쿼리 결과가 비어있어야 경고가 해결된 것입니다
SELECT 
  'inquiries (pg_policies)' as source,
  'inquiries' as table_name,
  cmd,
  COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'inquiries'
  AND cmd IN ('UPDATE', 'DELETE')
GROUP BY cmd

UNION ALL

SELECT 
  'reviews (pg_policies)' as source,
  'reviews' as table_name,
  cmd,
  COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'reviews'
  AND cmd IN ('UPDATE', 'DELETE')
GROUP BY cmd

UNION ALL

-- pg_policy 테이블에서 직접 확인 (더 정확)
SELECT 
  'inquiries (pg_policy)' as source,
  'inquiries' as table_name,
  CASE 
    WHEN pol.polcmd = 'u' THEN 'UPDATE'
    WHEN pol.polcmd = 'd' THEN 'DELETE'
    ELSE pol.polcmd::text
  END as cmd,
  COUNT(*) as policy_count
FROM pg_policy pol
JOIN pg_class pc ON pol.polrelid = pc.oid
JOIN pg_namespace pn ON pc.relnamespace = pn.oid
WHERE pn.nspname = 'public'
  AND pc.relname = 'inquiries'
  AND pol.polcmd IN ('u', 'd')
GROUP BY pol.polcmd

UNION ALL

SELECT 
  'reviews (pg_policy)' as source,
  'reviews' as table_name,
  CASE 
    WHEN pol.polcmd = 'u' THEN 'UPDATE'
    WHEN pol.polcmd = 'd' THEN 'DELETE'
    ELSE pol.polcmd::text
  END as cmd,
  COUNT(*) as policy_count
FROM pg_policy pol
JOIN pg_class pc ON pol.polrelid = pc.oid
JOIN pg_namespace pn ON pc.relnamespace = pn.oid
WHERE pn.nspname = 'public'
  AND pc.relname = 'reviews'
  AND pol.polcmd IN ('u', 'd')
GROUP BY pol.polcmd;

-- ============================================
-- 5. Security Advisor 강제 새로고침 (선택사항)
-- ============================================
-- 
-- Security Advisor가 캐시를 사용하는 경우, 
-- SQL 실행 후에도 경고가 사라지는데 시간이 걸릴 수 있습니다.
-- 
-- Security Advisor 페이지에서:
-- 1. "Refresh" 버튼 클릭
-- 2. 몇 분 후 다시 확인
-- 3. 여전히 경고가 나타나면 Supabase 지원팀에 문의

-- ============================================
-- 참고사항
-- ============================================
-- 
-- 1. service_role은 RLS를 우회하므로 UPDATE/DELETE 정책이 필요 없습니다.
--    서버 사이드 API에서 SUPABASE_SERVICE_ROLE_KEY를 사용하면
--    자동으로 RLS를 우회하여 모든 작업이 가능합니다.
--
-- 2. 공개 사용자는 INSERT만 가능하고, UPDATE/DELETE는 불가능합니다.
--    이것이 가장 안전한 설정입니다.
--
-- 3. 만약 UPDATE/DELETE 정책을 반드시 만들어야 한다면,
--    더 구체적인 조건을 사용하세요 (예: 특정 컬럼 값 확인 등).
--
-- 4. Security Advisor 경고를 해결하려면:
--    - UPDATE/DELETE 정책에서 USING (true) 또는 WITH CHECK (true) 사용 금지
--    - 또는 UPDATE/DELETE 정책을 아예 만들지 않음 (권장)
--
-- 5. pg_policy 테이블에서 직접 확인:
--    - pg_policies 뷰는 때때로 정책을 놓칠 수 있음
--    - pg_policy 테이블을 직접 조회하여 더 정확하게 확인 가능
--    - polcmd 값: 'r' = SELECT, 'a' = INSERT, 'w' = UPDATE, 'd' = DELETE
