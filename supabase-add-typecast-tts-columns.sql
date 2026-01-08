-- Typecast TTS 지원: 컨텐츠별 설정 + 관리자 기본 설정(app_settings)

-- 1) contents: 컨텐츠별 TTS 제공자/Typecast voice id
alter table public.contents
add column if not exists tts_provider text default 'naver';

alter table public.contents
add column if not exists typecast_voice_id text;

-- 2) app_settings: 관리자 컨텐츠 리스트 상단(전역 기본값)
alter table public.app_settings
add column if not exists selected_tts_provider text default 'naver';

alter table public.app_settings
add column if not exists selected_typecast_voice_id text;

