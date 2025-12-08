-- 저장된 결과 테이블 생성
CREATE TABLE IF NOT EXISTS saved_results (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  html TEXT NOT NULL,
  content JSONB,
  model TEXT DEFAULT 'gemini-2.5-flash',
  processing_time TEXT,
  user_name TEXT,
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성 (조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_saved_results_saved_at ON saved_results(saved_at DESC);

-- RLS (Row Level Security) 정책 설정 (모든 사용자가 읽고 쓸 수 있도록)
ALTER TABLE saved_results ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제 (있다면)
DROP POLICY IF EXISTS "Allow all users to read saved_results" ON saved_results;
DROP POLICY IF EXISTS "Allow all users to insert saved_results" ON saved_results;
DROP POLICY IF EXISTS "Allow all users to delete saved_results" ON saved_results;

-- 모든 사용자가 읽을 수 있도록 정책 생성
CREATE POLICY "Allow all users to read saved_results" ON saved_results
  FOR SELECT
  USING (true);

-- 모든 사용자가 삽입할 수 있도록 정책 생성
CREATE POLICY "Allow all users to insert saved_results" ON saved_results
  FOR INSERT
  WITH CHECK (true);

-- 모든 사용자가 삭제할 수 있도록 정책 생성
CREATE POLICY "Allow all users to delete saved_results" ON saved_results
  FOR DELETE
  USING (true);

-- 60일 이상 된 저장된 결과를 자동 삭제하는 함수 생성
CREATE OR REPLACE FUNCTION delete_old_saved_results()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.saved_results
  WHERE saved_at < NOW() - INTERVAL '60 days';
  
  -- 삭제된 레코드 수를 로그로 남기기 (선택사항)
  RAISE NOTICE 'Deleted old saved_results older than 60 days';
END;
$$;

-- pg_cron 확장 활성화 (이미 활성화되어 있으면 무시됨)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 매일 자정에 자동 삭제 함수 실행 (cron job 등록)
-- 기존 job이 있으면 삭제 후 재생성
DO $$
BEGIN
  -- 기존 job 삭제 (있다면)
  PERFORM cron.unschedule('delete-old-saved-results');
EXCEPTION
  WHEN OTHERS THEN
    -- job이 없으면 무시
    NULL;
END $$;

-- 매일 자정(00:00)에 실행되도록 cron job 등록
SELECT cron.schedule(
  'delete-old-saved-results',
  '0 0 * * *', -- 매일 자정 (cron 형식: 분 시 일 월 요일)
  $$SELECT delete_old_saved_results()$$
);

