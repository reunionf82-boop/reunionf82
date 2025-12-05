-- Supabase Storage RLS 정책 설정
-- thumbnails 버킷에 대한 읽기/쓰기 권한 설정

-- 기존 정책이 있으면 삭제 (에러 방지)
DROP POLICY IF EXISTS "Allow public read access" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow public updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes" ON storage.objects;

-- 1. 공개 읽기 권한 (모든 사용자가 썸네일을 볼 수 있음)
CREATE POLICY "Allow public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'thumbnails');

-- 2. 공개 읽기만 허용 (업로드/수정/삭제는 API 라우트를 통해 서비스 롤 키로 처리)
-- 관리자 인증 시스템이 추가되어 API 라우트에서 서비스 롤 키로 업로드하므로
-- Storage 정책은 읽기만 허용하면 됩니다.


