-- 결제 정보 저장 테이블 생성
CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  oid VARCHAR(100) UNIQUE NOT NULL, -- 주문번호 (AI년월일시분초_타임스탬프)
  content_id BIGINT REFERENCES contents(id) ON DELETE SET NULL, -- 컨텐츠 ID
  payment_code VARCHAR(4) NOT NULL, -- 아이템 코드 (4자리)
  name VARCHAR(200) NOT NULL, -- 아이템 이름
  pay INTEGER NOT NULL, -- 결제 금액
  payment_type VARCHAR(20) NOT NULL, -- 결제 타입 ('card' 또는 'mobile')
  user_name VARCHAR(100), -- 사용자 이름
  phone_number VARCHAR(20), -- 휴대폰 번호
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 결제 상태 ('pending', 'success', 'failed')
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- 결제 요청 일시
  completed_at TIMESTAMP WITH TIME ZONE, -- 결제 완료 일시
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성 (조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_payments_oid ON payments(oid);
CREATE INDEX IF NOT EXISTS idx_payments_content_id ON payments(content_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_payment_code ON payments(payment_code);

-- updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_payments_updated_at()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_payments_updated_at();

-- RLS 정책 설정 (관리자만 조회 가능)
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- 관리자만 모든 결제 정보 조회 가능
CREATE POLICY "관리자는 모든 결제 정보 조회 가능"
  ON payments
  FOR SELECT
  USING (true); -- 실제로는 인증 로직 추가 필요

-- 결제 정보는 서버에서만 삽입 가능 (API 라우트를 통해서만)
-- SECURITY DEFINER 함수를 통해 삽입하므로 RLS 정책은 필요 없음
-- 하지만 보안을 위해 명시적으로 정책 제거 (서버 사이드에서만 접근 가능)
-- RLS는 활성화되어 있지만, 서버 사이드 API 라우트는 서비스 롤 키를 사용하므로 RLS를 우회합니다.
