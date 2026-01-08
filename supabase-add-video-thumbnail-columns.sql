-- contents 테이블에 동영상 썸네일 컬럼 추가
-- 북커버, 엔딩북커버, 컨텐츠명 동영상 썸네일 저장용

-- 컨텐츠명 동영상 썸네일 (WebM 파일명, 확장자 제외)
ALTER TABLE contents ADD COLUMN IF NOT EXISTS thumbnail_video_url TEXT;

-- 북커버 동영상 썸네일 (WebM 파일명, 확장자 제외)
ALTER TABLE contents ADD COLUMN IF NOT EXISTS book_cover_thumbnail_video TEXT;

-- 엔딩북커버 동영상 썸네일 (WebM 파일명, 확장자 제외)
ALTER TABLE contents ADD COLUMN IF NOT EXISTS ending_book_cover_thumbnail_video TEXT;

-- 주석 추가
COMMENT ON COLUMN contents.thumbnail_video_url IS '컨텐츠명 동영상 썸네일 (WebM 파일명, 확장자 제외)';
COMMENT ON COLUMN contents.book_cover_thumbnail_video IS '북커버 동영상 썸네일 (WebM 파일명, 확장자 제외)';
COMMENT ON COLUMN contents.ending_book_cover_thumbnail_video IS '엔딩북커버 동영상 썸네일 (WebM 파일명, 확장자 제외)';

-- 참고: 소메뉴와 상세메뉴의 동영상 썸네일은 menu_items JSONB 필드 안에 저장됩니다.
-- menu_items 구조:
-- [
--   {
--     "value": "대메뉴",
--     "thumbnail_image_url": "이미지 URL",
--     "thumbnail_video_url": "동영상 파일명",
--     "subtitles": [
--       {
--         "subtitle": "소메뉴",
--         "thumbnail_image_url": "이미지 URL",
--         "thumbnail_video_url": "동영상 파일명",
--         "detailMenus": [
--           {
--             "detailMenu": "상세메뉴",
--             "thumbnail_image_url": "이미지 URL",
--             "thumbnail_video_url": "동영상 파일명"
--           }
--         ]
--       }
--     ]
--   }
-- ]
