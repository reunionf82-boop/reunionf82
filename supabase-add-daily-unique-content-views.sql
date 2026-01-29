create table if not exists daily_unique_content_views (
  id bigserial primary key,
  content_id bigint not null,
  day date not null,
  fingerprint_hash text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists daily_unique_content_views_uniq
  on daily_unique_content_views (content_id, day, fingerprint_hash);

create index if not exists daily_unique_content_views_day_idx
  on daily_unique_content_views (content_id, day);
