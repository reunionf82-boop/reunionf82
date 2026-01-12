-- Supabase Security Advisor 경고 해결: count_estimate 함수 search_path 설정
-- 
-- pg_temp_34.count_estimate는 임시 스키마의 함수입니다.
-- 임시 스키마의 함수는 직접 수정할 수 없지만, public 스키마에 count_estimate 함수가 있다면 수정합니다.

-- ============================================
-- 1단계: count_estimate 함수 확인 및 자동 수정
-- ============================================
-- 이 스크립트는 public 스키마에 count_estimate 함수가 있는지 확인하고,
-- 있다면 search_path를 설정하여 재생성합니다.

DO $$
DECLARE
  func_record RECORD;
  func_args TEXT;
  func_found BOOLEAN := false;
BEGIN
  -- public 스키마에 count_estimate 함수 찾기
  FOR func_record IN
    SELECT 
      p.oid,
      p.proname,
      pg_get_function_arguments(p.oid) as args,
      CASE 
        WHEN p.proconfig IS NULL OR NOT EXISTS (
          SELECT 1 FROM unnest(p.proconfig) AS config 
          WHERE config LIKE 'search_path=%'
        ) THEN true
        ELSE false
      END as needs_fix
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'count_estimate'
  LOOP
    func_found := true;
    func_args := func_record.args;
    
    IF func_record.needs_fix THEN
      -- ALTER FUNCTION을 사용하여 search_path 설정 (가장 간단하고 안전한 방법)
      EXECUTE format('ALTER FUNCTION public.count_estimate(%s) SET search_path = public', func_args);
      
      RAISE NOTICE 'Function count_estimate(%) has been updated with search_path = public', func_args;
    ELSE
      RAISE NOTICE 'Function count_estimate(%) already has search_path set', func_args;
    END IF;
  END LOOP;
  
  -- 함수가 없으면 알림
  IF NOT func_found THEN
    RAISE NOTICE 'No count_estimate function found in public schema.';
    RAISE NOTICE 'The warning is from a temporary schema (pg_temp_34) which cannot be modified.';
    RAISE NOTICE 'Temporary schema functions are automatically deleted when the session ends.';
    RAISE NOTICE 'If the warning persists, please contact Supabase Support or ignore it (temporary functions pose minimal security risk).';
  END IF;
END $$;

-- ============================================
-- 2단계: 모든 함수에서 search_path 확인 (선택사항)
-- ============================================
-- 다음 쿼리로 public 스키마의 모든 함수에서 search_path가 설정되지 않은 함수를 확인할 수 있습니다:
/*
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
WHERE n.nspname = 'public'
  AND p.prokind = 'f'  -- 일반 함수만
  AND (
    p.proconfig IS NULL OR NOT EXISTS (
      SELECT 1 FROM unnest(p.proconfig) AS config 
      WHERE config LIKE 'search_path=%'
    )
  )
ORDER BY p.proname;
*/

-- ============================================
-- 참고사항
-- ============================================
-- 1. pg_temp_34는 임시 스키마이므로 직접 수정할 수 없습니다.
-- 2. 임시 스키마의 함수는 세션 종료 시 자동으로 삭제됩니다.
-- 3. 만약 public 스키마에 count_estimate 함수가 없다면,
--    이 경고는 Supabase 내부 시스템에서 생성한 임시 함수일 수 있습니다.
-- 4. 임시 함수는 보안 위험이 거의 없지만, 경고를 제거하려면
--    Supabase Support에 문의하거나 경고를 무시할 수 있습니다.
-- 5. 이 스크립트를 실행한 후 Security Advisor를 새로고침하여 경고가 사라졌는지 확인하세요.
