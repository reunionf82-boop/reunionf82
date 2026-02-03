-- 유입 경로 구분: 포춘82 포털 vs 메타 광고 vs 기타
-- daily_page_views, daily_unique_page_views에 source 컬럼 추가 (portal | meta | direct)
-- ※ 유입 통계 대시보드에서 "포털/메타/기타" 구분을 쓰려면 이 스크립트를 Supabase SQL Editor에서 실행해야 합니다.

-- 1. daily_page_views
ALTER TABLE public.daily_page_views
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'direct';

DROP INDEX IF EXISTS daily_page_views_uniq;
CREATE UNIQUE INDEX daily_page_views_uniq
  ON public.daily_page_views (page, day, source);

-- 2. daily_unique_page_views
ALTER TABLE public.daily_unique_page_views
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'direct';

DROP INDEX IF EXISTS daily_unique_page_views_uniq;
CREATE UNIQUE INDEX daily_unique_page_views_uniq
  ON public.daily_unique_page_views (page, day, source, fingerprint_hash);

CREATE INDEX IF NOT EXISTS daily_unique_page_views_source_idx
  ON public.daily_unique_page_views (page, day, source);

-- 3. increment 함수: source 인자 추가
CREATE OR REPLACE FUNCTION public.increment_daily_page_view(p_page text, p_day date, p_source text DEFAULT 'direct')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_count integer;
  safe_source text := COALESCE(NULLIF(TRIM(p_source), ''), 'direct');
BEGIN
  INSERT INTO public.daily_page_views (page, day, source, view_count)
  VALUES (p_page, p_day, safe_source, 1)
  ON CONFLICT (page, day, source)
  DO UPDATE SET view_count = public.daily_page_views.view_count + 1
  RETURNING view_count INTO new_count;

  RETURN new_count;
END;
$$;

COMMENT ON COLUMN public.daily_page_views.source IS '유입 경로: portal(포춘82 포털), meta(메타/페이스북 광고), direct(기타/직접)';
COMMENT ON COLUMN public.daily_unique_page_views.source IS '유입 경로: portal, meta, direct';
