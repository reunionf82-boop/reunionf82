-- saved_results 테이블에 font_face 컬럼 추가 (웹폰트 CSS 저장용)
ALTER TABLE saved_results ADD COLUMN IF NOT EXISTS font_face TEXT;





