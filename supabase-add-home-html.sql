-- 홈(프론트 메뉴) 상단 HTML 뷰 지원

alter table public.app_settings
add column if not exists home_html text;

