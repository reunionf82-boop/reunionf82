-- 소제목 썸네일 관리 함수들
-- menu_items JSONB 구조 내의 subtitle 썸네일을 관리하기 위한 함수들

-- 1. 특정 소제목의 썸네일 업데이트 함수
CREATE OR REPLACE FUNCTION update_subtitle_thumbnail(
  content_id INTEGER,
  menu_index INTEGER,
  subtitle_id BIGINT,
  thumbnail_url TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_menu_items JSONB;
  updated_menu_items JSONB;
  menu_item JSONB;
  subtitles JSONB;
  updated_subtitles JSONB;
  subtitle JSONB;
  i INTEGER;
BEGIN
  -- 현재 menu_items 가져오기
  SELECT menu_items INTO current_menu_items
  FROM contents
  WHERE id = content_id;
  
  -- menu_items가 NULL이거나 배열이 아니면 빈 배열로 초기화
  IF current_menu_items IS NULL OR jsonb_typeof(current_menu_items) != 'array' THEN
    current_menu_items := '[]'::JSONB;
  END IF;
  
  -- menu_index가 유효한지 확인
  IF menu_index < 0 OR menu_index >= jsonb_array_length(current_menu_items) THEN
    RAISE EXCEPTION 'Invalid menu_index: %', menu_index;
  END IF;
  
  -- 해당 메뉴 항목 가져오기
  menu_item := current_menu_items->menu_index;
  
  -- subtitles 배열 가져오기 (없으면 빈 배열)
  IF menu_item->'subtitles' IS NULL THEN
    subtitles := '[]'::JSONB;
  ELSE
    subtitles := menu_item->'subtitles';
  END IF;
  
  -- subtitle_id에 해당하는 소제목 찾아서 썸네일 업데이트
  updated_subtitles := '[]'::JSONB;
  FOR i IN 0..jsonb_array_length(subtitles) - 1 LOOP
    subtitle := subtitles->i;
    IF (subtitle->>'id')::BIGINT = subtitle_id THEN
      -- 썸네일 업데이트
      subtitle := jsonb_set(subtitle, '{thumbnail}', to_jsonb(thumbnail_url));
    END IF;
    updated_subtitles := updated_subtitles || jsonb_build_array(subtitle);
  END LOOP;
  
  -- menu_item의 subtitles 업데이트
  menu_item := jsonb_set(menu_item, '{subtitles}', updated_subtitles);
  
  -- menu_items 배열 업데이트
  updated_menu_items := jsonb_set(
    current_menu_items,
    ARRAY[menu_index::TEXT],
    menu_item
  );
  
  -- contents 테이블 업데이트
  UPDATE contents
  SET menu_items = updated_menu_items,
      updated_at = NOW()
  WHERE id = content_id;
  
  RETURN updated_menu_items;
END;
$$;

-- 2. 특정 소제목의 썸네일 삭제 함수
CREATE OR REPLACE FUNCTION delete_subtitle_thumbnail(
  content_id INTEGER,
  menu_index INTEGER,
  subtitle_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_menu_items JSONB;
  updated_menu_items JSONB;
  menu_item JSONB;
  subtitles JSONB;
  updated_subtitles JSONB;
  subtitle JSONB;
  i INTEGER;
BEGIN
  -- 현재 menu_items 가져오기
  SELECT menu_items INTO current_menu_items
  FROM contents
  WHERE id = content_id;
  
  -- menu_items가 NULL이거나 배열이 아니면 빈 배열로 초기화
  IF current_menu_items IS NULL OR jsonb_typeof(current_menu_items) != 'array' THEN
    current_menu_items := '[]'::JSONB;
  END IF;
  
  -- menu_index가 유효한지 확인
  IF menu_index < 0 OR menu_index >= jsonb_array_length(current_menu_items) THEN
    RAISE EXCEPTION 'Invalid menu_index: %', menu_index;
  END IF;
  
  -- 해당 메뉴 항목 가져오기
  menu_item := current_menu_items->menu_index;
  
  -- subtitles 배열 가져오기 (없으면 빈 배열)
  IF menu_item->'subtitles' IS NULL THEN
    subtitles := '[]'::JSONB;
  ELSE
    subtitles := menu_item->'subtitles';
  END IF;
  
  -- subtitle_id에 해당하는 소제목 찾아서 썸네일 삭제
  updated_subtitles := '[]'::JSONB;
  FOR i IN 0..jsonb_array_length(subtitles) - 1 LOOP
    subtitle := subtitles->i;
    IF (subtitle->>'id')::BIGINT = subtitle_id THEN
      -- 썸네일 필드 제거 (또는 빈 문자열로 설정)
      subtitle := jsonb_set(subtitle, '{thumbnail}', '""'::JSONB);
    END IF;
    updated_subtitles := updated_subtitles || jsonb_build_array(subtitle);
  END LOOP;
  
  -- menu_item의 subtitles 업데이트
  menu_item := jsonb_set(menu_item, '{subtitles}', updated_subtitles);
  
  -- menu_items 배열 업데이트
  updated_menu_items := jsonb_set(
    current_menu_items,
    ARRAY[menu_index::TEXT],
    menu_item
  );
  
  -- contents 테이블 업데이트
  UPDATE contents
  SET menu_items = updated_menu_items,
      updated_at = NOW()
  WHERE id = content_id;
  
  RETURN updated_menu_items;
END;
$$;

-- 3. 모든 소제목 썸네일 추출 함수 (Storage 삭제용)
CREATE OR REPLACE FUNCTION get_all_subtitle_thumbnails()
RETURNS TABLE(
  content_id INTEGER,
  thumbnail_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  content_record RECORD;
  menu_item JSONB;
  subtitle JSONB;
  i INTEGER;
  j INTEGER;
BEGIN
  FOR content_record IN
    SELECT id, menu_items
    FROM contents
    WHERE menu_items IS NOT NULL
  LOOP
    -- menu_items가 문자열인 경우 파싱 (JSONB로 변환)
    IF jsonb_typeof(content_record.menu_items) = 'string' THEN
      BEGIN
        menu_item := content_record.menu_items::JSONB;
      EXCEPTION WHEN OTHERS THEN
        CONTINUE;
      END;
    ELSE
      menu_item := content_record.menu_items;
    END IF;
    
    -- menu_items가 배열인지 확인
    IF jsonb_typeof(menu_item) = 'array' THEN
      -- 각 메뉴 항목 순회
      FOR i IN 0..jsonb_array_length(menu_item) - 1 LOOP
        menu_item := menu_item->i;
        
        -- subtitles 배열 확인
        IF menu_item->'subtitles' IS NOT NULL AND jsonb_typeof(menu_item->'subtitles') = 'array' THEN
          -- 각 소제목 순회
          FOR j IN 0..jsonb_array_length(menu_item->'subtitles') - 1 LOOP
            subtitle := menu_item->'subtitles'->j;
            
            -- 썸네일 URL이 있고 비어있지 않으면 반환
            IF subtitle->>'thumbnail' IS NOT NULL AND (subtitle->>'thumbnail') != '' THEN
              content_id := content_record.id;
              thumbnail_url := subtitle->>'thumbnail';
              RETURN NEXT;
            END IF;
          END LOOP;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  
  RETURN;
END;
$$;

-- 4. 특정 컨텐츠의 모든 소제목 썸네일 추출 함수
CREATE OR REPLACE FUNCTION get_content_subtitle_thumbnails(p_content_id INTEGER)
RETURNS TABLE(
  thumbnail_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  menu_items JSONB;
  menu_item JSONB;
  subtitle JSONB;
  i INTEGER;
  j INTEGER;
BEGIN
  -- menu_items 가져오기
  SELECT menu_items INTO menu_items
  FROM contents
  WHERE id = p_content_id;
  
  IF menu_items IS NULL THEN
    RETURN;
  END IF;
  
  -- menu_items가 문자열인 경우 파싱
  IF jsonb_typeof(menu_items) = 'string' THEN
    BEGIN
      menu_items := menu_items::JSONB;
    EXCEPTION WHEN OTHERS THEN
      RETURN;
    END;
  END IF;
  
  -- menu_items가 배열인지 확인
  IF jsonb_typeof(menu_items) = 'array' THEN
    -- 각 메뉴 항목 순회
    FOR i IN 0..jsonb_array_length(menu_items) - 1 LOOP
      menu_item := menu_items->i;
      
      -- subtitles 배열 확인
      IF menu_item->'subtitles' IS NOT NULL AND jsonb_typeof(menu_item->'subtitles') = 'array' THEN
        -- 각 소제목 순회
        FOR j IN 0..jsonb_array_length(menu_item->'subtitles') - 1 LOOP
          subtitle := menu_item->'subtitles'->j;
          
          -- 썸네일 URL이 있고 비어있지 않으면 반환
          IF subtitle->>'thumbnail' IS NOT NULL AND (subtitle->>'thumbnail') != '' THEN
            thumbnail_url := subtitle->>'thumbnail';
            RETURN NEXT;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;
  
  RETURN;
END;
$$;

-- 사용 예시:
-- 
-- 1. 소제목 썸네일 업데이트:
-- SELECT update_subtitle_thumbnail(1, 0, 1234567890, 'https://example.com/thumbnail.jpg');
--
-- 2. 소제목 썸네일 삭제:
-- SELECT delete_subtitle_thumbnail(1, 0, 1234567890);
--
-- 3. 모든 소제목 썸네일 조회:
-- SELECT * FROM get_all_subtitle_thumbnails();
--
-- 4. 특정 컨텐츠의 소제목 썸네일 조회:
-- SELECT * FROM get_content_subtitle_thumbnails(1);

