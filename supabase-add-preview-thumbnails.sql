-- contents 테이블에 preview_thumbnails 컬럼 추가
-- 재회상품 미리보기 썸네일 배열 (최대 3개) 저장용

ALTER TABLE contents ADD COLUMN IF NOT EXISTS preview_thumbnails JSONB DEFAULT '[]'::jsonb;

-- 기존 데이터에 대해 빈 배열로 초기화 (NULL인 경우)
UPDATE contents 
SET preview_thumbnails = '[]'::jsonb 
WHERE preview_thumbnails IS NULL;
