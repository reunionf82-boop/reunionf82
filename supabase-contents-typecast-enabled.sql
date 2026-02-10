-- 컨텐츠별 타입캐스트 온/오프 (관리자 리스트에서 설정)
-- false이면 해당 컨텐츠만 타입캐스트 미사용(네이버 TTS만). 전역 typecast_enabled와 별도.

alter table public.contents
add column if not exists typecast_enabled boolean default false;

comment on column public.contents.typecast_enabled is '해당 컨텐츠에서 타입캐스트 사용 여부. false면 이 컨텐츠만 네이버 TTS 사용';
