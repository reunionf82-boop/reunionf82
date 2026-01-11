-- 리뷰 테이블 생성
CREATE TABLE IF NOT EXISTS public.reviews (
  id BIGSERIAL PRIMARY KEY,
  content_id INTEGER NOT NULL REFERENCES public.contents(id) ON DELETE CASCADE,
  review_text TEXT NOT NULL,
  user_name TEXT,
  is_visible BOOLEAN DEFAULT false, -- 관리자가 노출 승인한 리뷰만 true
  is_best BOOLEAN DEFAULT false, -- 관리자가 베스트로 지정한 리뷰만 true
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_reviews_content_id ON public.reviews(content_id);
CREATE INDEX IF NOT EXISTS idx_reviews_is_visible ON public.reviews(is_visible);
CREATE INDEX IF NOT EXISTS idx_reviews_is_best ON public.reviews(is_best);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON public.reviews(created_at DESC);

-- contents 테이블에 클릭 수 필드 추가
ALTER TABLE public.contents ADD COLUMN IF NOT EXISTS click_count INTEGER DEFAULT 0;

-- RLS 정책 (리뷰는 공개 조회만 허용)
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- 공개 조회 정책 (노출 승인된 리뷰만)
-- 기존 정책이 있으면 삭제 후 재생성
DROP POLICY IF EXISTS "Allow public read visible reviews" ON public.reviews;
CREATE POLICY "Allow public read visible reviews"
ON public.reviews FOR SELECT
TO public
USING (is_visible = true);

-- 관리자는 모든 리뷰 조회/수정 가능 (서비스 롤 키 사용)
