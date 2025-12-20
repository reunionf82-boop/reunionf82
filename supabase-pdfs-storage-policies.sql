-- Supabase Storage RLS 정책 설정
-- pdfs 버킷에 대한 읽기/쓰기 권한 설정
-- 클라이언트 사이드에서 직접 PDF 업로드를 위해 공개 권한 필요

-- 기존 정책이 있으면 삭제 (에러 방지)
DROP POLICY IF EXISTS "Allow public read access pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Allow public updates pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes pdfs" ON storage.objects;

-- 1. 공개 읽기 권한 (모든 사용자가 PDF를 볼 수 있음)
CREATE POLICY "Allow public read access pdfs"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'pdfs');

-- 2. 공개 업로드 권한 (클라이언트 사이드에서 PDF 업로드 허용)
CREATE POLICY "Allow public uploads pdfs"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'pdfs');

-- 3. 공개 업데이트 권한 (upsert: true 옵션 사용 시 필요)
CREATE POLICY "Allow public updates pdfs"
ON storage.objects
FOR UPDATE
TO public
USING (bucket_id = 'pdfs')
WITH CHECK (bucket_id = 'pdfs');

-- 4. 공개 삭제 권한 (필요한 경우)
CREATE POLICY "Allow public deletes pdfs"
ON storage.objects
FOR DELETE
TO public
USING (bucket_id = 'pdfs');
