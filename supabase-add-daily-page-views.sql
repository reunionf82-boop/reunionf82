create table if not exists daily_page_views (
  id bigserial primary key,
  page text not null,
  day date not null,
  view_count integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists daily_page_views_uniq
  on daily_page_views (page, day);

create table if not exists daily_unique_page_views (
  id bigserial primary key,
  page text not null,
  day date not null,
  fingerprint_hash text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists daily_unique_page_views_uniq
  on daily_unique_page_views (page, day, fingerprint_hash);

create index if not exists daily_unique_page_views_day_idx
  on daily_unique_page_views (page, day);
