-- 점사 재시도 숏코드 테이블
CREATE TABLE IF NOT EXISTS resume_codes (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  saved_id BIGINT,
  request_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resume_codes_code ON resume_codes(code);
CREATE INDEX IF NOT EXISTS idx_resume_codes_expires_at ON resume_codes(expires_at);

ALTER TABLE resume_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role access to resume_codes" ON resume_codes;
CREATE POLICY "Allow service role access to resume_codes" ON resume_codes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
