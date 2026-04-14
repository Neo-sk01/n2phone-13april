ALTER TABLE monthly_kpi_snapshots
  ADD COLUMN IF NOT EXISTS bh_kpis jsonb;
