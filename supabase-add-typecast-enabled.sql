-- 타입캐스트 온/오프: app_settings에 전역 스위치 추가
-- false이면 프론트/다시보기에서 타입캐스트 UI 비노출, TTS는 네이버만 사용

alter table public.app_settings
add column if not exists typecast_enabled boolean default false;

comment on column public.app_settings.typecast_enabled is 'true=타입캐스트 사용, false=네이버 TTS만 사용(타입캐스트 UI/기능 비활성화)';
