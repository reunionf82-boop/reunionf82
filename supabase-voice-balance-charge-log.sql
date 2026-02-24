-- 동일 결제(oid)로 잔액 충전이 여러 번 호출되어 2배/3배 충전되는 버그 방지
-- charge API에서 이 테이블에 oid를 먼저 insert하고, 성공 시에만 voice_balance에 반영

CREATE TABLE IF NOT EXISTS voice_balance_charge_log (
  oid TEXT NOT NULL PRIMARY KEY,
  content_id INTEGER NOT NULL,
  phone TEXT NOT NULL,
  amount_wan INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE voice_balance_charge_log IS '음성 잔액 충전 멱등성: 동일 oid는 1회만 충전';
