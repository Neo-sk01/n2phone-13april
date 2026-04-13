-- Monthly pull job control log
create table if not exists monthly_pull_log (
  id serial primary key,
  month char(7) not null unique,
  status text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  record_counts jsonb,
  error text
);

-- Raw CDR segments keyed by (id, month) for monthly partitioning
create table if not exists cdrs (
  id text not null,
  month char(7) not null,
  from_call_id text not null,
  from_value text,
  from_name text,
  from_user text,
  to_value text,
  to_user text,
  to_id text,
  start_time timestamptz not null,
  answer_time timestamptz,
  end_time timestamptz,
  duration integer,
  call_type text,
  raw jsonb not null,
  primary key (id, month)
);

create index if not exists idx_cdrs_month on cdrs (month);
create index if not exists idx_cdrs_from_call_id on cdrs (from_call_id, month);

-- Queue stats snapshot per queue per month
create table if not exists queue_stats (
  queue_id text not null,
  month char(7) not null,
  description text,
  call_volume integer,
  calls_offered integer,
  calls_handled integer,
  abandoned_calls integer,
  calls_forwarded integer,
  average_talk_time numeric,
  average_handle_time numeric,
  average_answer_speed numeric,
  service_level numeric,
  abandoned_rate numeric,
  raw jsonb not null,
  primary key (queue_id, month)
);

-- ConnectWise tickets
create table if not exists tickets (
  id integer not null,
  month char(7) not null,
  summary text,
  date_entered timestamptz,
  phone_number text,
  source_id integer,
  raw jsonb not null,
  primary key (id, month)
);

create index if not exists idx_tickets_month on tickets (month);

-- Pre-computed KPI snapshots for completed months
create table if not exists monthly_kpi_snapshots (
  month char(7) primary key,
  computed_at timestamptz not null,
  kpis jsonb not null
);
