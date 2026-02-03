-- payments 테이블에 비밀번호 컬럼 추가
-- Supabase SQL Editor에서 실행

ALTER TABLE IF EXISTS public.payments
  ADD COLUMN IF NOT EXISTS password VARCHAR(100);

COMMENT ON COLUMN public.payments.password IS '결제 시 입력한 비밀번호(원문 저장)';
