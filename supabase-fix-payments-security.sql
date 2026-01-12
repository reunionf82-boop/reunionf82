-- payments 테이블 보안 경고 해결

-- 1. update_payments_updated_at 함수의 search_path 고정
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

-- 2. RLS 정책 제거 (서버 사이드 API는 서비스 롤 키로 RLS 우회)
DROP POLICY IF EXISTS "서버에서 결제 정보 삽입 가능" ON payments;

-- 참고: 서버 사이드 API 라우트(/api/payment/save)는 서비스 롤 키를 사용하므로
-- RLS를 우회하여 안전하게 데이터를 삽입할 수 있습니다.
-- 실제 보안은 API 라우트의 인증 로직으로 보장됩니다.
