-- 저장된 결과 자동 삭제 배치 작업 비활성화
-- 이 SQL을 Supabase SQL Editor에서 실행하면 60일 후 자정 자동 삭제가 중지됩니다.

-- cron job 제거
DO $$
BEGIN
  -- 기존 job 삭제
  PERFORM cron.unschedule('delete-old-saved-results');
  RAISE NOTICE 'Cron job "delete-old-saved-results"가 제거되었습니다.';
EXCEPTION
  WHEN OTHERS THEN
    -- job이 없으면 무시
    RAISE NOTICE 'Cron job이 존재하지 않거나 이미 제거되었습니다.';
END $$;

-- 확인: 남아있는 cron job 목록 확인 (선택사항)
-- SELECT * FROM cron.job WHERE jobname = 'delete-old-saved-results';

