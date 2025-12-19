-- saved_results 테이블에서 font_face 컬럼 삭제 (HTML에 포함되어 있으므로 불필요)
ALTER TABLE saved_results DROP COLUMN IF EXISTS font_face;







