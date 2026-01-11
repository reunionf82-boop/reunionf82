-- reviews 테이블에 image_url 컬럼 추가
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS image_url TEXT;
