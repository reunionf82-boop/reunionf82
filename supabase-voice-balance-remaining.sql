-- voice_balance에 상담 잔여시간(초) 컬럼 추가
-- Supabase SQL Editor에서 실행

ALTER TABLE voice_balance
  ADD COLUMN IF NOT EXISTS remaining_seconds integer NOT NULL DEFAULT 0 CHECK (remaining_seconds >= 0);

COMMENT ON COLUMN voice_balance.remaining_seconds IS '상담 종료 시 남은 시간(초). 폼에서 잔여시간으로 재상담 가능';
