# N2Phone CSH Dashboard — Platform Architecture

## Overview

The CSH (Customer Service Hub) Dashboard is a Next.js application backed by PostgreSQL.
It ingests call data from Versature (CDRs, queue stats, queue splits) and service tickets
from ConnectWise, then computes KPI snapshots for display.

## Two Data Pipelines

### 1. Daily Sync (Next.js process)

The `syncDay()` function in `lib/versature/sync.ts` is the primary real-time ingest path:

- Fetches CDRs for a single day from the Versature API
- Builds logical calls via `buildLogicalCalls()`
- Fetches queue stats and day-level split reports for all tracked queues
- Writes into Part 1 tables: `cdr_segments`, `logical_calls`, `queue_stats_daily`, `queue_splits`
- Computes a `kpi_daily_snapshots` entry via `getDashboardData()`
- Tracked in `ingest_runs` table

### 2. Monthly Historical Pull (Docker job-runner)

The job-runner (`job-runner/`) is a standalone Node.js process running in Docker:

- **Trigger:** Cron at `0 0 1 * *` (midnight Toronto time on the 1st), or `POST /run?month=YYYY-MM`
- **Port 3001** is Docker-internal only — not exposed to the host
- **Next.js proxy:** `POST /api/jobs/monthly-pull` forwards to `JOB_RUNNER_URL` (default `http://localhost:3001`)

#### Monthly Pull Flow

1. Check/acquire lock in `monthly_pull_log` (CAS with `status != 'in_progress'`)
2. Fetch CDRs day-by-day from Versature (`getDomainCdrs`), 3s pacing between days
3. Upsert raw CDRs into `cdrs` table in 500-row batches
4. Fetch queue stats for 4 env-driven queues, upsert into `queue_stats`
5. Fetch ConnectWise tickets for the month, upsert into `tickets` in 500-row batches
6. Sync each day into Part 1 tables via `syncDay()` for KPI computation
7. Compute full KPI snapshot → `monthly_kpi_snapshots.kpis`
8. Compute business-hours KPI snapshot → `monthly_kpi_snapshots.bh_kpis`
9. Mark `monthly_pull_log` as completed with record counts

Progress is tracked via `progress_pct`, `progress_message`, and `total_pages` columns
in `monthly_pull_log`. The status endpoint (`GET /api/jobs/monthly-pull/status`) exposes
these values and flags jobs as stale if in-progress for over 30 minutes.

#### ConnectWise Integration

- Tickets are fetched from `GET {CONNECTWISE_BASE_URL}/service/tickets` with conditions
  filtering by `dateEntered` range and `source/id={CONNECTWISE_SOURCE_ID}`
- Authentication: Basic auth from `{COMPANY_ID}+{PUBLIC_KEY}:{PRIVATE_KEY}`, plus `clientId` header
- Pagination: `pageSize=100`, stops on empty or short page
- ConnectWise failure is **non-fatal** — the pull continues and records `tickets: 0`

## Database Schema

### Part 1 tables (daily sync)

| Table | Key | Purpose |
|-------|-----|---------|
| `ingest_runs` | `id` (serial) | Tracks each sync run |
| `cdr_segments` | `source_hash` | Raw CDR segments with hash-based dedup |
| `logical_calls` | `(call_date, dedupe_key)` | Deduplicated logical calls |
| `queue_stats_daily` | `(queue_id, stats_date)` | Per-queue daily stats |
| `queue_splits` | `(queue_id, split_period, interval_start)` | Queue split reports |
| `kpi_daily_snapshots` | `snapshot_date` | Daily KPI computation cache |

### Part 2 tables (monthly pull)

| Table | Key | Purpose |
|-------|-----|---------|
| `monthly_pull_log` | `month` | Job control with progress tracking |
| `cdrs` | `(id, month)` | Raw CDRs partitioned by month |
| `queue_stats` | `(queue_id, month)` | Monthly queue stat snapshots |
| `tickets` | `(id, month)` | ConnectWise tickets by month |
| `monthly_kpi_snapshots` | `month` | Pre-computed KPI + BH KPI snapshots |

## Queue Configuration

Queue IDs are environment-driven (not hardcoded):

| Env Var | Purpose |
|---------|---------|
| `QUEUE_ENGLISH` | English language queue |
| `QUEUE_FRENCH` | French language queue |
| `QUEUE_AI_OVERFLOW_EN` | AI overflow — English |
| `QUEUE_AI_OVERFLOW_FR` | AI overflow — French |

## Docker Compose

Two services: `postgres` (port 5432 exposed to host) and `job-runner` (port 3001 internal only).
PostgreSQL migrations run from `db/migrations/` via Docker entrypoint.

## Rate Limiting & Retry

### Versature
- Shared `versatureFetch()` handles 429s with exponential backoff (2s base, 30s cap, 5 attempts)
- 401: invalidates cached OAuth token, retries once
- CDR fetch uses 3s sleep between days, queue stats use 500ms between queues

### ConnectWise
- No rate limiter — pagination stops on non-OK responses
- Network errors bubble up but are caught as non-fatal in the monthly pull
