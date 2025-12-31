-- Supabase Security Advisor 경고 해결: count_estimate 함수 수정
-- 
-- 주의: pg_temp_3.count_estimate는 임시 스키마의 함수입니다.
-- 임시 스키마의 함수는 직접 수정할 수 없습니다.
-- 
-- 해결 방법:
-- 1. Security Advisor에서 정확한 함수명과 스키마 확인
-- 2. 함수가 public 스키마에 있는 경우, 아래 쿼리로 함수 정의 확인 후 수정
-- 3. 임시 스키마인 경우 Supabase Support에 문의하거나 무시 가능 (일시적 경고일 수 있음)

-- ============================================
-- 1단계: 모든 함수에서 search_path가 설정되지 않은 함수 확인
-- ============================================
-- 다음 쿼리를 Supabase SQL Editor에서 실행하여 문제가 있는 함수를 찾으세요:
SELECT 
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  CASE 
    WHEN p.proconfig IS NULL OR NOT EXISTS (
      SELECT 1 FROM unnest(p.proconfig) AS config 
      WHERE config LIKE 'search_path=%'
    ) THEN '⚠️ No search_path set'
    ELSE array_to_string(p.proconfig, ', ')
  END as config
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname IN ('public')  -- public 스키마만 확인 (임시 스키마는 제외)
  AND p.proname LIKE '%count%estimate%'
ORDER BY n.nspname, p.proname;

-- ============================================
-- 2단계: 함수 정의 확인 (위에서 함수를 찾은 경우)
-- ============================================
-- 위 쿼리에서 함수를 찾았다면, 다음 쿼리로 함수 정의를 확인하세요:
/*
SELECT 
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'  -- 실제 스키마명으로 변경
  AND p.proname = 'count_estimate';  -- 실제 함수명으로 변경
*/

-- ============================================
-- 3단계: 함수 재생성 (search_path 설정 포함)
-- ============================================
-- 2단계에서 확인한 함수 정의를 복사하고, 
-- SECURITY DEFINER 다음에 다음 줄을 추가하세요:
-- SET search_path = public
--
-- 예시:
/*
DROP FUNCTION IF EXISTS public.count_estimate(...);  -- 실제 매개변수로 변경
CREATE OR REPLACE FUNCTION public.count_estimate(...)  -- 실제 매개변수로 변경
RETURNS ...  -- 실제 반환 타입으로 변경
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public  -- ⬅️ 이 줄을 추가
AS $$
-- 함수 본문
$$;
*/

-- ============================================
-- 참고사항
-- ============================================
-- 1. pg_temp_3는 임시 스키마이므로 직접 수정할 수 없습니다.
-- 2. 임시 스키마의 함수는 세션 종료 시 자동으로 삭제됩니다.
-- 3. 만약 경고가 계속 나타난다면 Supabase Support에 문의하세요.
-- 4. 또는 경고를 무시해도 됩니다 (임시 함수는 보안 위험이 거의 없음).
