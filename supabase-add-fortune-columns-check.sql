-- app_settings 테이블에 필요한 컬럼 추가 및 확인
-- fortune_view_mode와 use_sequential_fortune 컬럼이 없으면 추가

-- 1. fortune_view_mode 컬럼 추가 (없으면)
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS fortune_view_mode TEXT DEFAULT 'batch';

-- 2. use_sequential_fortune 컬럼 추가 (없으면)
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS use_sequential_fortune BOOLEAN DEFAULT false;

-- 3. 기존 레코드의 NULL 값 업데이트
UPDATE app_settings 
SET 
  fortune_view_mode = COALESCE(fortune_view_mode, 'batch'),
  use_sequential_fortune = COALESCE(use_sequential_fortune, false)
WHERE id = 1;

-- 4. 컬럼 추가 후 전체 데이터 확인
SELECT 
  id, 
  selected_model, 
  selected_speaker, 
  fortune_view_mode, 
  use_sequential_fortune,
  selected_tts_provider,
  selected_typecast_voice_id,
  home_html,
  updated_at 
FROM app_settings 
WHERE id = 1;

-- 5. 테이블 구조 확인 (모든 컬럼 확인)
SELECT 
  column_name, 
  data_type, 
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'app_settings'
ORDER BY ordinal_position;
