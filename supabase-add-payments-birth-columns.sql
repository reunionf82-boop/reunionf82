-- payments 테이블에 본인정보(생년월일·태어난 시) 컬럼 추가
-- Supabase SQL Editor에서 실행 후, 어드민/대시보드에서 결제 건별 본인정보 전체 확인 가능

ALTER TABLE IF EXISTS public.payments
  ADD COLUMN IF NOT EXISTS calendar_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS birth_year SMALLINT,
  ADD COLUMN IF NOT EXISTS birth_month SMALLINT,
  ADD COLUMN IF NOT EXISTS birth_day SMALLINT,
  ADD COLUMN IF NOT EXISTS birth_hour VARCHAR(50);

COMMENT ON COLUMN public.payments.calendar_type IS '양력/음력: solar, lunar, lunar-leap';
COMMENT ON COLUMN public.payments.birth_year IS '생년';
COMMENT ON COLUMN public.payments.birth_month IS '생월 (1-12)';
COMMENT ON COLUMN public.payments.birth_day IS '생일';
COMMENT ON COLUMN public.payments.birth_hour IS '태어난 시 (예: 丑(축) 01:30 ~ 03:29)';
