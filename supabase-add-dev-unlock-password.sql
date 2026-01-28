-- 폼 페이지 개발용 버튼 표시 비밀번호 저장
ALTER TABLE app_settings
ADD COLUMN IF NOT EXISTS dev_unlock_password_hash TEXT;
ALTER TABLE app_settings
ADD COLUMN IF NOT EXISTS dev_unlock_duration_minutes INTEGER;
