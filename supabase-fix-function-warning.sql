-- Supabase Security Advisor 경고 해결: 함수 재생성
-- 이 SQL을 Supabase SQL Editor에서 실행하면 "Function Search Path Mutable" 경고가 해결됩니다.

-- 기존 함수 삭제
DROP FUNCTION IF EXISTS delete_old_saved_results();

-- search_path가 설정된 함수 재생성
CREATE FUNCTION delete_old_saved_results()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.saved_results
  WHERE saved_at < NOW() - INTERVAL '60 days';
  
  RAISE NOTICE 'Deleted old saved_results older than 60 days';
END;
$$;

-- cron job이 있다면 다시 등록
DO $$
BEGIN
  -- 기존 job 삭제 (있다면)
  PERFORM cron.unschedule('delete-old-saved-results');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- 매일 자정(00:00)에 실행되도록 cron job 등록
SELECT cron.schedule(
  'delete-old-saved-results',
  '0 0 * * *', -- 매일 자정
  $$SELECT delete_old_saved_results()$$
);




