-- 관리자 컨텐츠 리스트 드래그 순서 저장용
-- sort_order ASC로 정렬 (작을수록 위). 기존 데이터는 id 내림차순과 동일하게 -id로 설정
ALTER TABLE contents ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
-- 기존 행은 id 내림차순과 동일하게 -id로 설정 (한 번만 실행 권장)
UPDATE contents SET sort_order = -id WHERE sort_order = 0 OR sort_order IS NULL;
CREATE INDEX IF NOT EXISTS idx_contents_sort_order ON contents(sort_order);
