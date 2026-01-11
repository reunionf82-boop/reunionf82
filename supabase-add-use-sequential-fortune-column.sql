-- app_settings 테이블에 use_sequential_fortune 컬럼 추가
-- 직렬점사(true) / 병렬점사(false) 설정용

-- 컬럼이 없으면 추가
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS use_sequential_fortune BOOLEAN DEFAULT false;

-- 기존 레코드가 있고 값이 NULL이면 기본값(false)으로 설정
UPDATE app_settings 
SET use_sequential_fortune = false 
WHERE id = 1 AND use_sequential_fortune IS NULL;

-- 컬럼 추가 후 확인
SELECT 
  id, 
  selected_model, 
  selected_speaker, 
  fortune_view_mode, 
  use_sequential_fortune,
  selected_tts_provider,
  selected_typecast_voice_id,
  updated_at 
FROM app_settings 
WHERE id = 1;
