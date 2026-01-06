-- contents 테이블에 폰트 컬러 컬럼 추가
-- 각 섹션별로 개별 컬러를 지정할 수 있도록 함
-- 컬러 값은 Hex 코드 형식으로 저장 (예: #FF0000, #000000)

-- 대메뉴 컬러
ALTER TABLE contents ADD COLUMN IF NOT EXISTS menu_color TEXT;

-- 소메뉴 컬러
ALTER TABLE contents ADD COLUMN IF NOT EXISTS subtitle_color TEXT;

-- 상세메뉴 컬러
ALTER TABLE contents ADD COLUMN IF NOT EXISTS detail_menu_color TEXT;

-- 본문 컬러
ALTER TABLE contents ADD COLUMN IF NOT EXISTS body_color TEXT;
