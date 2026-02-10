-- 점사 요약 기능: 관리자 설정(글자수) + 저장 결과 요약 저장용

-- 1) app_settings: 점사 요약 시 LLM이 지킬 최대 글자수
alter table public.app_settings
add column if not exists summary_max_chars integer default 500;

comment on column public.app_settings.summary_max_chars is '점사 요약 시 LLM이 생성할 최대 글자수';

-- 2) saved_results: 점사 요약 텍스트 (LLM 생성 결과)
alter table public.saved_results
add column if not exists fortune_summary text;

comment on column public.saved_results.fortune_summary is '점사 요약 (LLM 생성, 관리자 설정 글자수 이내)';

-- 3) contents: 컨텐츠별 점사 요약 글자수 (null이면 app_settings.summary_max_chars 사용)
alter table public.contents
add column if not exists summary_max_chars integer;

comment on column public.contents.summary_max_chars is '해당 컨텐츠 점사 요약 시 최대 글자수. null이면 전역 설정 사용';
