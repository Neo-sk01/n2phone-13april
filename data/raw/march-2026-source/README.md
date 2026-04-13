# March 2026 Raw Data Bundle

Source container: `n2phone_db`
Source database: `n2phone`
Export date: `2026-04-13`
Month filter: `2026-03`

Files:
- `cdrs_2026-03.csv` — 7,915 raw CDR rows with the original `raw` JSON payload preserved
- `queue_stats_2026-03.csv` — 4 raw monthly queue-stat rows with the original `raw` JSON payload preserved
- `tickets_2026-03.csv` — 256 raw ConnectWise ticket rows with the original `raw` JSON payload preserved
- `monthly_pull_log_2026-03.csv` — 1 source pipeline metadata row for the March pull
- `monthly_kpi_snapshots_2026-03.csv` — 1 derived KPI snapshot row for reference only
- `source-schema.sql` — source-table schema for `cdrs`, `queue_stats`, `tickets`, `monthly_pull_log`, and `monthly_kpi_snapshots`

Notes:
- The rawest fields available from the source database are preserved, especially the `raw` JSONB columns.
- `monthly_kpi_snapshots_2026-03.csv` is included for convenience, but it is derived data, not raw source data.
- The bundle reflects the completed March pull from the `n2phone_db` Docker container.

Quick restore outline:
1. Create the tables from `source-schema.sql` in a Postgres database.
2. Import each CSV with `\copy` into matching tables.
3. Use the `raw` JSON columns if you want the closest representation to the original API payloads.
