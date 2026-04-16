-- Raw calls that hit AI-overflow extensions, pulled via /cdrs/users/
create table if not exists ai_candidate_calls (
  cdr_id            text      not null,
  month             char(7)   not null,
  to_user           text      not null,
  from_number       text,
  normalized_phone  text,
  start_time        timestamptz not null,
  answer_time       timestamptz,
  end_time          timestamptz,
  duration          integer,
  raw               jsonb     not null,
  primary key (cdr_id, month)
);

create index if not exists idx_ai_candidate_calls_month
  on ai_candidate_calls (month);
create index if not exists idx_ai_candidate_calls_phone_time
  on ai_candidate_calls (normalized_phone, start_time);
create index if not exists idx_ai_candidate_calls_to_user
  on ai_candidate_calls (to_user, month);

-- Extend existing tickets table with correlation-relevant fields
alter table tickets add column if not exists normalized_phone text;
alter table tickets add column if not exists status text;
alter table tickets add column if not exists resolved_date_time timestamptz;
alter table tickets add column if not exists sla_status text;
alter table tickets add column if not exists merged_into_ticket_id integer;
alter table tickets add column if not exists closed_flag boolean;

create index if not exists idx_tickets_normalized_phone
  on tickets (normalized_phone);
create index if not exists idx_tickets_date_entered
  on tickets (date_entered);

-- Linkage between AI calls and tickets
create table if not exists connectwise_correlations (
  cdr_id        text    not null,
  month         char(7) not null,
  ticket_id     integer not null,
  confidence    text    not null,
  reason        text,
  created_at    timestamptz not null default now(),
  primary key (cdr_id, month, ticket_id)
);

create index if not exists idx_correlations_month on connectwise_correlations (month);
create index if not exists idx_correlations_ticket on connectwise_correlations (ticket_id);
