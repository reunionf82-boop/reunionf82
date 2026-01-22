-- 홈(프론트 메뉴) 배경색 설정 지원
-- 예: '#000000' 같은 hex 컬러 문자열 저장

ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS home_bg_color text;

