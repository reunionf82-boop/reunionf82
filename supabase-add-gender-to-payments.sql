-- payments 테이블에 성별(gender) 컬럼 추가
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS gender VARCHAR(10); -- 'male' 또는 'female'

-- 인덱스 추가 (성별 통계 조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_payments_gender ON payments(gender);
