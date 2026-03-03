-- 음성형 서비스 정식 런칭용 DB 초기화
-- Supabase 대시보드 → SQL Editor에서 실행
-- 실행 후: voice_balance, voice_balance_charge_log, voice_balance_grant_log(있으면),
--          voice_summary_asked, voice_conversation_summaries 모든 데이터 삭제

TRUNCATE TABLE voice_balance;
TRUNCATE TABLE voice_balance_charge_log;

-- voice_summary_asked가 voice_conversation_summaries를 참조하므로 한 번에 TRUNCATE (참조하는 쪽 먼저)
TRUNCATE TABLE voice_summary_asked, voice_conversation_summaries;

-- voice_balance_grant_log 테이블이 있는 경우에만 실행 (없으면 에러 무시하고 다음 단계로)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'voice_balance_grant_log'
  ) THEN
    TRUNCATE TABLE voice_balance_grant_log;
  END IF;
END $$;
