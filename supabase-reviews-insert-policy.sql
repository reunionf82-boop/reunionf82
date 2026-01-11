-- reviews 테이블에 INSERT 정책 추가
-- 서비스 롤 키를 사용하지만, RLS 정책이 없으면 문제가 될 수 있으므로 추가

-- 기존 INSERT 정책이 있으면 삭제
DROP POLICY IF EXISTS "Allow service role to insert reviews" ON public.reviews;
DROP POLICY IF EXISTS "Allow public to insert reviews" ON public.reviews;

-- 서비스 롤 키를 사용하는 경우 RLS를 우회하지만, 정책을 추가하여 안전하게 처리
CREATE POLICY "Allow service role to insert reviews"
ON public.reviews
FOR INSERT
TO service_role
WITH CHECK (true);

-- 공개 사용자도 리뷰 작성 가능하도록 정책 추가 (서비스 롤 키를 사용하는 경우 필요 없지만 추가)
CREATE POLICY "Allow public to insert reviews"
ON public.reviews
FOR INSERT
TO public
WITH CHECK (true);
