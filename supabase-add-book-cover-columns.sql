-- contents 테이블에 북커버와 엔딩북커버 썸네일 컬럼 추가
ALTER TABLE contents ADD COLUMN IF NOT EXISTS book_cover_thumbnail TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS ending_book_cover_thumbnail TEXT;


