-- payments 테이블 구조 보완 (서버 폴링 및 Upsert 지원)

-- 1. oid 컬럼에 유니크 제약조건 추가 (Upsert 동작을 위해 필수)
-- 이미 제약조건이 있다면 에러가 날 수 있으니, 없을 때만 추가하도록 DO 블록 사용
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payments_oid_key'
    ) THEN
        ALTER TABLE public.payments
        ADD CONSTRAINT payments_oid_key UNIQUE (oid);
    END IF;
END $$;

-- 2. status 컬럼 추가 (이미 존재하겠지만 확인 차원)
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- 3. 조회 성능을 위한 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_payments_oid ON public.payments(oid);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
