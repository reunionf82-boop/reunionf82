-- 썸네일 URL을 새 프로젝트로 업데이트하는 SQL
-- 올드 프로젝트: tokazaacpwiqwzgoqpmf, jjcnrrbqqjciwqrxgedh
-- 신규 프로젝트: fdnfeqdrrjtxernozmdi

-- 1. 현재 썸네일 URL 확인 (올드 프로젝트 URL을 사용하는 항목)
SELECT id, content_name, thumbnail_url 
FROM contents 
WHERE thumbnail_url IS NOT NULL 
  AND (thumbnail_url LIKE '%tokazaacpwiqwzgoqpmf%' OR thumbnail_url LIKE '%jjcnrrbqqjciwqrxgedh%');

-- 2-1. tokazaacpwiqwzgoqpmf 프로젝트 URL 업데이트
UPDATE contents
SET thumbnail_url = REPLACE(
  thumbnail_url,
  'tokazaacpwiqwzgoqpmf.supabase.co',
  'fdnfeqdrrjtxernozmdi.supabase.co'
)
WHERE thumbnail_url IS NOT NULL 
  AND thumbnail_url LIKE '%tokazaacpwiqwzgoqpmf%';

-- 2-2. jjcnrrbqqjciwqrxgedh 프로젝트 URL 업데이트
UPDATE contents
SET thumbnail_url = REPLACE(
  thumbnail_url,
  'jjcnrrbqqjciwqrxgedh.supabase.co',
  'fdnfeqdrrjtxernozmdi.supabase.co'
)
WHERE thumbnail_url IS NOT NULL 
  AND thumbnail_url LIKE '%jjcnrrbqqjciwqrxgedh%';

-- 3-1. menu_items의 썸네일 URL 업데이트 (tokazaacpwiqwzgoqpmf)
UPDATE contents
SET menu_items = (
  SELECT jsonb_agg(
    CASE 
      WHEN item->>'thumbnail' IS NOT NULL 
        AND (item->>'thumbnail')::text LIKE '%tokazaacpwiqwzgoqpmf%'
      THEN jsonb_set(
        item,
        '{thumbnail}',
        to_jsonb(
          REPLACE(
            (item->>'thumbnail')::text,
            'tokazaacpwiqwzgoqpmf.supabase.co',
            'fdnfeqdrrjtxernozmdi.supabase.co'
          )
        )
      )
      ELSE item
    END
  )
  FROM jsonb_array_elements(
    CASE 
      WHEN jsonb_typeof(menu_items) = 'array' THEN menu_items
      ELSE '[]'::jsonb
    END
  ) AS item
)
WHERE menu_items IS NOT NULL
  AND jsonb_typeof(menu_items) = 'array'
  AND menu_items::text LIKE '%tokazaacpwiqwzgoqpmf%';

-- 3-2. menu_items의 썸네일 URL 업데이트 (jjcnrrbqqjciwqrxgedh)
UPDATE contents
SET menu_items = (
  SELECT jsonb_agg(
    CASE 
      WHEN item->>'thumbnail' IS NOT NULL 
        AND (item->>'thumbnail')::text LIKE '%jjcnrrbqqjciwqrxgedh%'
      THEN jsonb_set(
        item,
        '{thumbnail}',
        to_jsonb(
          REPLACE(
            (item->>'thumbnail')::text,
            'jjcnrrbqqjciwqrxgedh.supabase.co',
            'fdnfeqdrrjtxernozmdi.supabase.co'
          )
        )
      )
      ELSE item
    END
  )
  FROM jsonb_array_elements(
    CASE 
      WHEN jsonb_typeof(menu_items) = 'array' THEN menu_items
      ELSE '[]'::jsonb
    END
  ) AS item
)
WHERE menu_items IS NOT NULL
  AND jsonb_typeof(menu_items) = 'array'
  AND menu_items::text LIKE '%jjcnrrbqqjciwqrxgedh%';

-- 4. 업데이트 결과 확인
SELECT id, content_name, thumbnail_url 
FROM contents 
WHERE thumbnail_url IS NOT NULL;

-- 5. menu_items의 썸네일 URL 확인
SELECT 
  id, 
  content_name,
  jsonb_array_elements(menu_items)->>'thumbnail' as menu_thumbnail
FROM contents 
WHERE menu_items IS NOT NULL
  AND jsonb_typeof(menu_items) = 'array'
  AND menu_items::text LIKE '%thumbnail%';

