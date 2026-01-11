-- 문의하기 테이블 생성
CREATE TABLE IF NOT EXISTS public.inquiries (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON public.inquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_email ON public.inquiries(email);

-- RLS 정책 (관리자만 조회 가능, 공개 사용자는 INSERT만 가능)
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

-- 공개 사용자는 문의 작성만 가능
DROP POLICY IF EXISTS "Allow public to insert inquiries" ON public.inquiries;
CREATE POLICY "Allow public to insert inquiries"
ON public.inquiries
FOR INSERT
TO public
WITH CHECK (true);

-- 서비스 롤 키를 사용하는 관리자는 모든 작업 가능 (RLS 우회)
