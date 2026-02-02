-- 12시간 경과 후에도 재시도(점사보기)를 허용할 수 있도록 운영자 예외 테이블
-- 어드민에서 주문번호(oid) + 허용 시간 입력 시 해당 oid에 대해 점사보기 허용

CREATE TABLE IF NOT EXISTS public.payment_retry_allowances (
  oid TEXT PRIMARY KEY,
  allowed_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'Asia/Seoul'),
  updated_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'Asia/Seoul')
);

COMMENT ON TABLE public.payment_retry_allowances IS '결제 재시도 예외: 12시간 경과 후에도 점사보기 허용 (운영자 설정)';
