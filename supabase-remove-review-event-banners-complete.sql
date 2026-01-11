-- 리뷰 이벤트 배너 관련 모든 데이터 및 구조 완전 삭제

-- 1. contents 테이블에서 review_event_banners 컬럼 삭제
ALTER TABLE public.contents 
DROP COLUMN IF EXISTS review_event_banners;

-- 2. RPC 함수 삭제 (있다면)
DROP FUNCTION IF EXISTS public.get_review_event_banners(content_id_param integer);

-- 3. Storage에서 review-events 폴더의 모든 파일 삭제는 수동으로 진행해야 함
-- Supabase Storage 대시보드에서 thumbnails 버킷의 review-events 폴더를 삭제하세요

-- 확인 쿼리
SELECT 
  column_name, 
  data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'contents' 
  AND column_name = 'review_event_banners';

-- 결과가 없으면 삭제 완료
