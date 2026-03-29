-- 삼선 메뉴: 설백야(재회상품) vs 도결(평생사주·올해사주)
ALTER TABLE public.contents ADD COLUMN IF NOT EXISTS slide_menu_category TEXT DEFAULT '설백야';

COMMENT ON COLUMN public.contents.slide_menu_category IS '슬라이드 메뉴 카테고리: 설백야=재회상품, 도결=평생사주·올해사주. 미설정·기타 값은 설백야로 취급';

-- 기존 행은 DEFAULT로 설백야 유지 (재회상품)
