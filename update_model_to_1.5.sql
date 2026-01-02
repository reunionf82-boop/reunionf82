-- Supabase SQL Editor에서 실행할 쿼리
-- app_settings 테이블의 selected_model을 gemini-1.5-pro로 업데이트

-- 1. 현재 값 확인
SELECT id, selected_model, selected_speaker, fortune_view_mode, updated_at 
FROM app_settings 
WHERE id = 1;

-- 2. 모델 값 업데이트 (레코드가 있는 경우)
UPDATE app_settings 
SET selected_model = 'gemini-1.5-pro', 
    updated_at = NOW()
WHERE id = 1;

-- 3. 레코드가 없는 경우 새로 생성
INSERT INTO app_settings (id, selected_model, selected_speaker, fortune_view_mode, updated_at)
VALUES (1, 'gemini-1.5-pro', 'nara', 'batch', NOW())
ON CONFLICT (id) 
DO UPDATE SET 
  selected_model = 'gemini-1.5-pro',
  updated_at = NOW();

-- 4. 업데이트 후 확인
SELECT id, selected_model, selected_speaker, fortune_view_mode, updated_at 
FROM app_settings 
WHERE id = 1;
