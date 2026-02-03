-- user_credentials 테이블에 평문 저장용 컬럼 추가 (선택 사항)
-- 복호화 스크립트 실행 전에 이 파일을 적용한 뒤, 스크립트로 encrypted_* 값을 복호화하여 채웁니다.
-- 주의: 비밀번호를 평문으로 저장하는 것은 보안상 권장하지 않습니다. 전화번호만 평문으로 두고
--       비밀번호는 기존 encrypted_password를 유지하거나, 검증 전용 해시로 전환하는 것을 권장합니다.

ALTER TABLE user_credentials
  ADD COLUMN IF NOT EXISTS phone_plain TEXT,
  ADD COLUMN IF NOT EXISTS password_plain TEXT;

COMMENT ON COLUMN user_credentials.phone_plain IS '복호화된 휴대폰 번호 (마이그레이션/운영용, 선택)';
COMMENT ON COLUMN user_credentials.password_plain IS '복호화된 비밀번호 (보안상 비권장, 필요 시에만 사용)';
