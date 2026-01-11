-- contents 테이블에 review_event_banners 컬럼 추가
ALTER TABLE contents 
ADD COLUMN IF NOT EXISTS review_event_banners JSONB DEFAULT '{"basic": "", "details": []}'::jsonb;

-- 코멘트 추가
COMMENT ON COLUMN contents.review_event_banners IS '리뷰 이벤트 배너 정보 (basic: 기본 배너 URL, details: 상세 배너 URL 배열)';
