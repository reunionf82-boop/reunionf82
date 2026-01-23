-- Voice MVP (internal) tables
-- Goal: keep MVP fully isolated from existing reunion service.
-- Apply in Supabase SQL editor.

-- Ensure UUID generator exists (Supabase usually has this enabled, but keep it safe)
create extension if not exists pgcrypto;

-- 1) Config (single row recommended)
create table if not exists public.voice_mvp_config (
  id bigint primary key generated always as identity,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  base_model text not null default 'gemini-2.0-flash-001',
  -- Voice output preferences (GenAI Live prebuilt voices)
  voice_gender text not null default 'female', -- female|male
  voice_style text not null default 'calm', -- calm|bright|firm|empathetic|warm
  voice_name_female text not null default 'Aoede',
  voice_name_male text not null default 'Fenrir',
  -- Personas (admin-editable)
  persona_saju text,
  persona_fortune text,
  persona_gunghap text,
  persona_reunion text
);

-- Idempotent alter (in case table existed before this file was updated)
-- Remove Pro-related fields (MVP simplification)
alter table public.voice_mvp_config drop column if exists pro_model;
alter table public.voice_mvp_config drop column if exists promote_min_chars;
alter table public.voice_mvp_config drop column if exists promote_min_seconds;
alter table public.voice_mvp_config drop column if exists pro_max_turns;

alter table public.voice_mvp_config add column if not exists persona_saju text;
alter table public.voice_mvp_config add column if not exists persona_fortune text;
alter table public.voice_mvp_config add column if not exists persona_gunghap text;
alter table public.voice_mvp_config add column if not exists persona_reunion text;
alter table public.voice_mvp_config add column if not exists voice_gender text;
alter table public.voice_mvp_config add column if not exists voice_style text;
alter table public.voice_mvp_config add column if not exists voice_name_female text;
alter table public.voice_mvp_config add column if not exists voice_name_male text;

-- Seed a config row if empty
insert into public.voice_mvp_config (
  base_model,
  voice_gender,
  voice_style,
  voice_name_female,
  voice_name_male,
  persona_saju,
  persona_fortune,
  persona_gunghap,
  persona_reunion
)
select
  'gemini-2.0-flash-001',
  'female',
  'calm',
  'Aoede',
  'Fenrir',
  $$당신은 전통 명리(사주) 기반 상담사입니다.
- 근거: 제공된 만세력/사주 데이터만 사용합니다(추측 금지).
- 말투: 차분하고 따뜻하게, 단정 대신 “가능성/경향”으로 설명.
- 구성: (1) 핵심 요약 3줄 (2) 강점/주의점 (3) 실천 조언 3개 (4) 마지막에 확인 질문 1개.
- 금칙: 공포 마케팅, 극단적 단정, 의학/법률 확정 판단.$$,
  $$당신은 “운세/흐름” 상담사입니다.
- 입력: 사주/만세력 + (오늘 기준) 최근 흐름을 현실적으로 연결합니다.
- 구성: (1) 이번 달/최근 흐름 요약 (2) 연애/일/금전/건강 중 사용자가 선택한 주제에 집중 (3) 피해야 할 행동 2개/추천 행동 2개 (4) 다음 질문 1개.
- 말투: 가볍지만 성의있게, 실천 중심.
- 금칙: 특정 날짜 단정(“그날 100%”), 과도한 불안 조장.$$,
  $$당신은 궁합 상담사입니다.
- 입력: 본인/상대 만세력만 근거로 사용합니다.
- 목표: 관계의 강점/충돌 지점/조율 방법을 구체적으로 제시합니다.
- 구성: (1) 관계 핵심 테마 1줄 (2) 잘 맞는 점 3개 (3) 충돌 포인트 3개 + 해결법 (4) 대화/만남에서 바로 쓸 문장 예시 2개 (5) 마지막 질문 1개.
- 금칙: “헤어져라/무조건 안 된다” 같은 단정.$$,
  $$당신은 재회 상담사입니다.
- 입력: 만세력 + 사용자가 제공한 상황 설명을 함께 고려합니다.
- 목표: 감정 공감 → 현실적 가능성 점검 → 행동 계획을 구체화합니다.
- 구성: (1) 현재 상황 진단 (2) 상대 심리/관계 포인트 (3) 금지 행동 3개 (4) 7일 실행 플랜(짧게) (5) 마지막 질문 1개.
- 금칙: 집착/스토킹 유도, 조작/가스라이팅 조언.$$ 
where not exists (select 1 from public.voice_mvp_config);

-- Backfill defaults for existing rows if null
update public.voice_mvp_config
set
  voice_gender = coalesce(nullif(btrim(voice_gender), ''), 'female'),
  voice_style = coalesce(nullif(btrim(voice_style), ''), 'calm'),
  voice_name_female = coalesce(nullif(btrim(voice_name_female), ''), 'Aoede'),
  voice_name_male = coalesce(nullif(btrim(voice_name_male), ''), 'Fenrir'),
  -- treat NULL/empty/whitespace as missing
  persona_saju = coalesce(nullif(btrim(persona_saju), ''), $$당신은 전통 명리(사주) 기반 상담사입니다.
- 근거: 제공된 만세력/사주 데이터만 사용합니다(추측 금지).
- 말투: 차분하고 따뜻하게, 단정 대신 “가능성/경향”으로 설명.
- 구성: (1) 핵심 요약 3줄 (2) 강점/주의점 (3) 실천 조언 3개 (4) 마지막에 확인 질문 1개.
- 금칙: 공포 마케팅, 극단적 단정, 의학/법률 확정 판단.$$),
  persona_fortune = coalesce(nullif(btrim(persona_fortune), ''), $$당신은 “운세/흐름” 상담사입니다.
- 입력: 사주/만세력 + (오늘 기준) 최근 흐름을 현실적으로 연결합니다.
- 구성: (1) 이번 달/최근 흐름 요약 (2) 연애/일/금전/건강 중 사용자가 선택한 주제에 집중 (3) 피해야 할 행동 2개/추천 행동 2개 (4) 다음 질문 1개.
- 말투: 가볍지만 성의있게, 실천 중심.
- 금칙: 특정 날짜 단정(“그날 100%”), 과도한 불안 조장.$$),
  persona_gunghap = coalesce(nullif(btrim(persona_gunghap), ''), $$당신은 궁합 상담사입니다.
- 입력: 본인/상대 만세력만 근거로 사용합니다.
- 목표: 관계의 강점/충돌 지점/조율 방법을 구체적으로 제시합니다.
- 구성: (1) 관계 핵심 테마 1줄 (2) 잘 맞는 점 3개 (3) 충돌 포인트 3개 + 해결법 (4) 대화/만남에서 바로 쓸 문장 예시 2개 (5) 마지막 질문 1개.
- 금칙: “헤어져라/무조건 안 된다” 같은 단정.$$),
  persona_reunion = coalesce(nullif(btrim(persona_reunion), ''), $$당신은 재회 상담사입니다.
- 입력: 만세력 + 사용자가 제공한 상황 설명을 함께 고려합니다.
- 목표: 감정 공감 → 현실적 가능성 점검 → 행동 계획을 구체화합니다.
- 구성: (1) 현재 상황 진단 (2) 상대 심리/관계 포인트 (3) 금지 행동 3개 (4) 7일 실행 플랜(짧게) (5) 마지막 질문 1개.
- 금칙: 집착/스토킹 유도, 조작/가스라이팅 조언.$$),
  updated_at = now()
where
  voice_gender is null or btrim(voice_gender) = ''
  or voice_style is null or btrim(voice_style) = ''
  or voice_name_female is null or btrim(voice_name_female) = ''
  or voice_name_male is null or btrim(voice_name_male) = ''
  or persona_saju is null or btrim(persona_saju) = ''
  or persona_fortune is null or btrim(persona_fortune) = ''
  or persona_gunghap is null or btrim(persona_gunghap) = ''
  or persona_reunion is null or btrim(persona_reunion) = '';

-- 2) Sessions
create table if not exists public.voice_mvp_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active', -- active|ended|error
  mode text not null, -- saju|gunghap|reunion

  -- profiles (raw input + normalized)
  profile_self jsonb not null,
  profile_partner jsonb,
  situation text,

  -- manse results (computed once at session start)
  manse_self jsonb,
  manse_partner jsonb,

  -- config snapshot at start (for reproducibility)
  routing_config_snapshot jsonb
);

create index if not exists idx_voice_mvp_sessions_created_at on public.voice_mvp_sessions (created_at desc);
create index if not exists idx_voice_mvp_sessions_status on public.voice_mvp_sessions (status);

-- 3) Messages (text transcript only; no audio storage)
create table if not exists public.voice_mvp_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.voice_mvp_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  role text not null, -- user|assistant|system|tool
  text text not null default '',
  model_used text,
  latency_ms int
);

create index if not exists idx_voice_mvp_messages_session_time on public.voice_mvp_messages (session_id, created_at);

-- 4) Events (routing/tool/error/etc)
create table if not exists public.voice_mvp_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.voice_mvp_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  type text not null,
  payload jsonb
);

create index if not exists idx_voice_mvp_events_session_time on public.voice_mvp_events (session_id, created_at);

-- =========================
-- RLS (Security Advisor fix)
-- - Enable RLS and deny all access from PostgREST roles.
-- - Service role (used by server APIs) bypasses RLS, so app continues to work.
-- =========================

alter table public.voice_mvp_config enable row level security;
alter table public.voice_mvp_sessions enable row level security;
alter table public.voice_mvp_messages enable row level security;
alter table public.voice_mvp_events enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='voice_mvp_config' and policyname='deny_all') then
    execute 'create policy deny_all on public.voice_mvp_config for all to public using (false) with check (false)';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='voice_mvp_sessions' and policyname='deny_all') then
    execute 'create policy deny_all on public.voice_mvp_sessions for all to public using (false) with check (false)';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='voice_mvp_messages' and policyname='deny_all') then
    execute 'create policy deny_all on public.voice_mvp_messages for all to public using (false) with check (false)';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='voice_mvp_events' and policyname='deny_all') then
    execute 'create policy deny_all on public.voice_mvp_events for all to public using (false) with check (false)';
  end if;
end $$;

