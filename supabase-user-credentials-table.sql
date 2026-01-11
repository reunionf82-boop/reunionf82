-- 사용자 인증 정보 저장 테이블 생성
-- 휴대폰 번호와 비밀번호를 암호화하여 저장

CREATE TABLE IF NOT EXISTS user_credentials (
  id BIGSERIAL PRIMARY KEY,
  request_key TEXT, -- realtime 모드일 때 사용 (temp_requests.id와 연결)
  saved_id BIGINT, -- 저장된 결과 ID (saved_results.id와 연결)
  encrypted_phone TEXT NOT NULL, -- 암호화된 휴대폰 번호
  encrypted_password TEXT NOT NULL, -- 암호화된 비밀번호
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL -- 24시간 후 자동 만료
);

-- 인덱스 생성 (조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_user_credentials_request_key ON user_credentials(request_key);
CREATE INDEX IF NOT EXISTS idx_user_credentials_saved_id ON user_credentials(saved_id);
CREATE INDEX IF NOT EXISTS idx_user_credentials_expires_at ON user_credentials(expires_at);

-- 만료된 데이터 자동 삭제 함수
CREATE OR REPLACE FUNCTION cleanup_expired_user_credentials()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM user_credentials
  WHERE expires_at < NOW();
END;
$$;

-- RLS 정책 설정
-- 기존 정책 삭제 (있다면)
DROP POLICY IF EXISTS "Allow all operations for service role" ON user_credentials;
DROP POLICY IF EXISTS "Service role can manage user_credentials" ON user_credentials;
DROP POLICY IF EXISTS "Block anon access to user_credentials" ON user_credentials;

-- RLS 활성화 (보안 경고 해결)
ALTER TABLE user_credentials ENABLE ROW LEVEL SECURITY;

-- 서비스 롤 키는 RLS를 우회하므로, 실제로는 이 정책이 필요 없지만
-- RLS가 활성화되어 있으면 정책이 필요합니다.
-- Security Advisor 경고를 해결하기 위해 service_role 정책을 추가합니다.
-- 참고: 서비스 롤 키를 사용하는 API 엔드포인트는 RLS를 우회하므로 안전합니다.
CREATE POLICY "Allow service role access to user_credentials" ON user_credentials
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
