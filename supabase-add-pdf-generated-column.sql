-- saved_results 테이블에 pdf_generated 필드 추가
-- PDF 생성 여부를 추적하기 위한 불린 필드

-- pdf_generated 컬럼 추가 (기본값: false)
ALTER TABLE saved_results 
ADD COLUMN IF NOT EXISTS pdf_generated BOOLEAN DEFAULT false;

-- 기존 레코드의 pdf_generated를 false로 설정 (null인 경우)
UPDATE saved_results 
SET pdf_generated = false 
WHERE pdf_generated IS NULL;

-- NOT NULL 제약 조건 추가 (기본값이 있으므로 안전)
ALTER TABLE saved_results 
ALTER COLUMN pdf_generated SET NOT NULL;

-- 인덱스 추가 (PDF 생성 여부로 조회할 때 성능 향상)
CREATE INDEX IF NOT EXISTS idx_saved_results_pdf_generated 
ON saved_results(pdf_generated);

-- 코멘트 추가 (필드 설명)
COMMENT ON COLUMN saved_results.pdf_generated IS 'PDF 생성 여부 (소장용으로 1회만 생성 가능)';
