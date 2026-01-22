-- contents 테이블에 노출/비노출 플래그 추가 (기본값: 비노출)
ALTER TABLE contents
ADD COLUMN IF NOT EXISTS is_exposed BOOLEAN NOT NULL DEFAULT FALSE;

-- 조회 성능을 위한 인덱스 (노출 컨텐츠만 필터링할 때 사용)
CREATE INDEX IF NOT EXISTS idx_contents_is_exposed ON contents(is_exposed);

