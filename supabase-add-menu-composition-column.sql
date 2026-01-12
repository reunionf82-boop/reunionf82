-- 상품 메뉴 구성 HTML 필드 추가

ALTER TABLE public.contents
ADD COLUMN IF NOT EXISTS menu_composition TEXT;
