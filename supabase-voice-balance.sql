-- 음성 상담 잔액(충전식): 콘텐츠별·전화번호별 잔액 (1000원 충전, 12초당 19원 차감)
-- Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS voice_balance (
  content_id integer NOT NULL,
  phone text NOT NULL,
  balance_wan integer NOT NULL DEFAULT 0 CHECK (balance_wan >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_id, phone)
);

COMMENT ON TABLE voice_balance IS '음성 상담 충전 잔액. 1000원 충전 후 12초당 19원 차감';
COMMENT ON COLUMN voice_balance.balance_wan IS '잔액(원)';

CREATE INDEX IF NOT EXISTS idx_voice_balance_updated_at ON voice_balance (updated_at);

-- RLS 활성화 (Security Advisor 대응). API는 service role로 접근하므로 RLS를 우회하며, anon/authenticated 직접 접근은 차단됨
ALTER TABLE voice_balance ENABLE ROW LEVEL SECURITY;

-- 정책 명시: anon/authenticated는 접근 불가 (backend만 service role로 접근)
CREATE POLICY "voice_balance_backend_only"
  ON voice_balance FOR ALL
  USING (false)
  WITH CHECK (false);
