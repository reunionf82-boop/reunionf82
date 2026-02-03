-- payments 테이블: 점사 완료/실패 추적 및 결제 실패 사유
-- 관리자 결제 현황에서 "정상 점사 완료 여부", "비정상 점사 원인", "다시보기 가능 여부", "결제 실패 원인" 확인용

-- 결제 건과 점사 요청 연결 (request_key = pending_{oid} → 점사 시작 후 request_xxx)
ALTER TABLE IF EXISTS public.payments
  ADD COLUMN IF NOT EXISTS request_key TEXT,
  ADD COLUMN IF NOT EXISTS saved_id BIGINT,
  ADD COLUMN IF NOT EXISTS fortune_status VARCHAR(30),
  ADD COLUMN IF NOT EXISTS fortune_failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS payment_failure_reason TEXT;

COMMENT ON COLUMN public.payments.request_key IS '점사 요청 키 (pending_oid 또는 request_xxx). 점사 완료 시 user_credentials와 연결';
COMMENT ON COLUMN public.payments.saved_id IS '저장된 점사 결과 ID (saved_results.id). 정상 완료 시 설정';
COMMENT ON COLUMN public.payments.fortune_status IS '점사 상태: pending, completed, failed, interrupted';
COMMENT ON COLUMN public.payments.fortune_failure_reason IS '점사 비정상 종료/실패 시 원인';
COMMENT ON COLUMN public.payments.payment_failure_reason IS '결제 실패 시 원인';

CREATE INDEX IF NOT EXISTS idx_payments_request_key ON public.payments(request_key);
CREATE INDEX IF NOT EXISTS idx_payments_saved_id ON public.payments(saved_id);
CREATE INDEX IF NOT EXISTS idx_payments_fortune_status ON public.payments(fortune_status);
