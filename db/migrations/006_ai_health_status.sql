-- Track whether AI-health data (AI CDRs, tickets, correlation) completed successfully
-- for a given month. Dashboards read this to decide whether to trust kpi11-14.
-- Values: 'complete' (all stages succeeded), 'degraded' (one or more failed),
-- 'unknown' (legacy rows written before this column existed).
alter table monthly_pull_log
  add column if not exists ai_health_status text not null default 'unknown';

create index if not exists idx_monthly_pull_log_ai_health_status
  on monthly_pull_log (ai_health_status);
