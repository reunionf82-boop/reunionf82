-- 임시 요청 데이터 저장 테이블 생성
-- sessionStorage 대신 Supabase에 임시 데이터 저장

CREATE TABLE IF NOT EXISTS temp_requests (
  id TEXT PRIMARY KEY, -- requestKey
  payload JSONB NOT NULL, -- 요청 데이터 (requestData, content, startTime, model, userName)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL -- 24시간 후 자동 만료
);

-- 인덱스 생성 (조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_temp_requests_expires_at ON temp_requests(expires_at);

-- 만료된 데이터 자동 삭제 함수 (선택사항)
CREATE OR REPLACE FUNCTION cleanup_expired_temp_requests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM temp_requests
  WHERE expires_at < NOW();
END;
$$;

-- RLS 정책 설정 (서비스 롤 키로 접근하므로 필요 없을 수 있지만 안전을 위해)
ALTER TABLE temp_requests ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽기/쓰기 가능 (서비스 롤 키 사용 시 필요 없음)
CREATE POLICY "Allow all operations for service role" ON temp_requests
  FOR ALL
  USING (true)
  WITH CHECK (true);
