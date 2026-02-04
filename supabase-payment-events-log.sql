-- 결제 흐름 추적용 이벤트 로그 테이블 (pending 원인 분석 등)
-- Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  oid text,
  request_key text,
  event_type text NOT NULL,
  success boolean NOT NULL,
  message text,
  meta jsonb
);

COMMENT ON TABLE public.payment_events IS '결제/점사 연결 흐름 추적 로그 (payment save, complete, user_credentials replace 등)';
COMMENT ON COLUMN public.payment_events.oid IS '주문번호 (payments.oid)';
COMMENT ON COLUMN public.payment_events.request_key IS 'request_key (pending_oid 또는 request_xxx)';
COMMENT ON COLUMN public.payment_events.event_type IS '예: payment_pending_saved, payment_complete_ok, uc_replace_ok, uc_replace_fallback';
COMMENT ON COLUMN public.payment_events.success IS '해당 단계 성공 여부';
COMMENT ON COLUMN public.payment_events.message IS '에러 메시지 또는 요약';
COMMENT ON COLUMN public.payment_events.meta IS '추가 정보 (json)';

CREATE INDEX IF NOT EXISTS idx_payment_events_oid ON public.payment_events (oid);
CREATE INDEX IF NOT EXISTS idx_payment_events_created_at ON public.payment_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_events_request_key ON public.payment_events (request_key) WHERE request_key IS NOT NULL;

-- RLS: 서버(service_role)만 접근 가능하도록 정책 추가 → Security Advisor "RLS Enabled No Policy" 해소
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_events_service_role_only" ON public.payment_events;
CREATE POLICY "payment_events_service_role_only"
  ON public.payment_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
