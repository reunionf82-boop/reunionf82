
-- 1. thumbnails 버킷을 public으로 설정 (이미 되어있을 수 있음)
UPDATE storage.buckets
SET public = true
WHERE id = 'thumbnails';

-- 2. 기존 정책 삭제 (중복 방지)
DROP POLICY IF EXISTS "Give public access to thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes" ON storage.objects;

-- 3. 필수 정책 생성: 누구나 읽기 가능 (review-events 폴더 포함 모든 파일)
CREATE POLICY "Allow public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'thumbnails');

-- 4. 필수 정책 생성: 누구나 업로드/수정/삭제 가능 (관리자 기능 원활화)
-- (실제 운영 시에는 authenticated role로 제한하는 것이 좋으나, 지금 문제 해결을 위해 public으로 엽니다)
CREATE POLICY "Allow public all access"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'thumbnails');

CREATE POLICY "Allow public update access"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'thumbnails');

CREATE POLICY "Allow public delete access"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'thumbnails');
