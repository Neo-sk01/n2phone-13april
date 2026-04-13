create table if not exists ingest_runs (
  id bigserial primary key,
  run_type text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'running',
  warnings jsonb not null default '[]'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists cdr_segments (
  source_hash text primary key,
  external_id text,
  call_type text,
  start_time timestamptz not null,
  answer_time timestamptz,
  end_time timestamptz not null,
  duration_seconds integer not null,
  from_number text,
  from_name text,
  from_user text,
  to_id text,
  payload jsonb not null,
  imported_at timestamptz not null default now()
);

comment on column cdr_segments.source_hash is
  'Derived fallback key. If Task 0 confirms external_id is reliable on every row, use external_id as the long-term conflict target instead.';

create index if not exists idx_cdr_segments_start_time on cdr_segments (start_time);
create index if not exists idx_cdr_segments_to_id on cdr_segments (to_id);

create table if not exists queue_stats_daily (
  queue_id text not null,
  stats_date date not null,
  calls_offered integer not null,
  abandoned_calls integer not null,
  abandoned_rate numeric(8,4) not null,
  average_talk_time integer not null,
  average_handle_time integer not null,
  payload jsonb not null,
  imported_at timestamptz not null default now(),
  primary key (queue_id, stats_date)
);

comment on column queue_stats_daily.stats_date is
  'America/Toronto business date requested from Versature; do not treat as UTC-derived';

create table if not exists queue_splits (
  queue_id text not null,
  split_period text not null,
  interval_start timestamptz not null,
  volume integer not null,
  payload jsonb not null,
  imported_at timestamptz not null default now(),
  primary key (queue_id, split_period, interval_start)
);

create table if not exists logical_calls (
  call_date date not null,
  dedupe_key text not null,
  caller_number text,
  dnis text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  answered boolean not null,
  duration_seconds integer not null,
  representative_hash text not null references cdr_segments (source_hash),
  payload jsonb not null,
  imported_at timestamptz not null default now(),
  primary key (call_date, dedupe_key)
);

create index if not exists idx_logical_calls_dnis on logical_calls (dnis);

create table if not exists kpi_daily_snapshots (
  snapshot_date date primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
