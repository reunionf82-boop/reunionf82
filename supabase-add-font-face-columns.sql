-- contents 테이블에 웹폰트 CSS 컬럼 추가 (각 섹션별 개별 폰트)
ALTER TABLE contents ADD COLUMN IF NOT EXISTS menu_font_face TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS subtitle_font_face TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS detail_menu_font_face TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS body_font_face TEXT;
