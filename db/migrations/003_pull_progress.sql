ALTER TABLE monthly_pull_log
  ADD COLUMN IF NOT EXISTS progress_pct smallint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress_message text,
  ADD COLUMN IF NOT EXISTS total_pages integer;
