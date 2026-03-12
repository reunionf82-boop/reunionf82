-- Supabase Security Advisor: "Function Search Path Mutable" (pg_temp_*.count_estimate) 대응
-- 경고 예: pg_temp_88.count_estimate, pg_temp_87.count_estimate 등
--
-- 1) public 스키마에 count_estimate가 있으면 search_path 설정
-- 2) pg_temp_88 등 pg_temp_* 스키마의 count_estimate는 세션 임시 객체라
--    마이그레이션으로 수정 불가 → 해당 세션 종료 시 사라지거나, 경고만 남을 수 있음 (무시 가능)

DO $$
DECLARE
  func_record RECORD;
  func_args TEXT;
  func_found BOOLEAN := false;
BEGIN
  FOR func_record IN
    SELECT
      p.oid,
      pg_get_function_arguments(p.oid) AS args,
      (p.proconfig IS NULL OR NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) AS c WHERE c::text LIKE 'search_path=%'
      )) AS needs_fix
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'count_estimate'
  LOOP
    func_found := true;
    func_args := func_record.args;
    IF func_record.needs_fix THEN
      EXECUTE format(
        'ALTER FUNCTION public.count_estimate(%s) SET search_path = public',
        func_args
      );
      RAISE NOTICE 'public.count_estimate(%) search_path set to public', func_args;
    ELSE
      RAISE NOTICE 'public.count_estimate(%) already has search_path', func_args;
    END IF;
  END LOOP;

  IF NOT func_found THEN
    RAISE NOTICE 'public.count_estimate not found. Warning may be from pg_temp_*.count_estimate (temporary schema - safe to ignore or will disappear when session ends).';
  END IF;
END $$;
