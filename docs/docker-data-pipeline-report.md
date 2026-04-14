# Docker Data Pipeline Report

Detailed technical reference for the Docker job-runner monthly historical pull.

## Trigger Mechanisms

### Automatic (Cron)

The job-runner uses `node-cron` to schedule `runMonthlyPull()` at `0 0 1 * *`.
The container runs with `TZ=America/Toronto`, so this fires at midnight Eastern
on the 1st of each month. It pulls the **previous** month's data.

### Manual (HTTP)

`POST /run?month=YYYY-MM` triggers a pull for the specified month.
Port 3001 is **not published** to the host in `docker-compose.yml` — it is
Docker-internal only. The Next.js app proxies to it via:

```
POST /api/jobs/monthly-pull  →  {JOB_RUNNER_URL}/run?month=...
```

Default `JOB_RUNNER_URL` is `http://localhost:3001`, which works when both
the Next.js app and job-runner are inside the same Docker network, or when
the job-runner is running on the host. If the Next.js app runs on the host
and the job-runner is in Docker, `JOB_RUNNER_URL` must be set to a reachable
address (e.g., `http://host.docker.internal:3001` won't work since 3001 isn't
published — you'd need to add a `ports` mapping or run both in Docker).

## Idempotency & Concurrency

The pull uses a CAS (Compare-And-Swap) pattern:

```sql
INSERT INTO monthly_pull_log (month, status, started_at)
VALUES ($1, 'in_progress', NOW())
ON CONFLICT (month) DO UPDATE
SET status = 'in_progress', started_at = NOW(), error = NULL, completed_at = NULL
WHERE monthly_pull_log.status != 'in_progress'
RETURNING id
```

If `RETURNING id` yields no rows, another pull is already in progress.
Completed months return `already_pulled` immediately. Failed months are retried.

## Phase-by-Phase Flow

### Phase 1: CDR Fetch (0–30% progress)

- Iterates day-by-day over the target month using `eachDayOfInterval`
- Calls `getDomainCdrs(dayStr, dayStr)` for each day
- `getDomainCdrs` paginates via `versatureFetch` at `limit=500` per page
- 3-second sleep between days to avoid rate limits
- All CDRs buffered in memory, then upserted via `upsertCDRBatch` in 500-row transactions
- Upsert key: `(id, month)` with `ON CONFLICT DO UPDATE`

### Phase 2: Queue Stats (30–40% progress)

- Fetches stats for 4 queues: `QUEUE_ENGLISH`, `QUEUE_FRENCH`, `QUEUE_AI_OVERFLOW_EN`, `QUEUE_AI_OVERFLOW_FR`
- Sequential fetch with 500ms sleep between queues
- Each result upserted into `queue_stats` with key `(queue_id, month)`
- Individual queue failures are caught and logged (non-fatal)

### Phase 3: ConnectWise Tickets (40–55% progress)

- Calls `fetchTickets(startDate, endDate)` from `lib/connectwise/client.ts`
- Fetches `GET {CONNECTWISE_BASE_URL}/service/tickets` with conditions:
  `dateEntered >= [start] AND dateEntered <= [end] AND source/id={SOURCE_ID}`
- Pagination: `pageSize=100`, stops on empty/short page or non-OK response
- Auth: Basic `{COMPANY_ID}+{PUBLIC_KEY}:{PRIVATE_KEY}` + `clientId` header
- Upserted into `tickets` table in 500-row batches, key `(id, month)`
- **Non-fatal:** ConnectWise errors are caught and logged; pull continues with `tickets: 0`

### Phase 4: Part 1 Sync (55–80% progress)

- Calls `syncDay(day)` for each day in the month
- This populates `cdr_segments`, `logical_calls`, `queue_stats_daily`, `queue_splits`,
  and `kpi_daily_snapshots` — the tables that `getDashboardData()` queries
- 3-second sleep between days
- If any day fails, the error is collected; if all fail, the pull is marked failed

### Phase 5: KPI Computation (80–95% progress)

- Computes full KPIs via `getDashboardData(period, { includeWeekends: false })`
- Stores in `monthly_kpi_snapshots.kpis` with metadata `{ dataSource: 'historical', lastUpdated }`
- Computes business-hours KPIs (weekday-only) via same function
- Stores in `monthly_kpi_snapshots.bh_kpis`

### Phase 6: Finalize (95–100%)

- Writes `record_counts = { cdrs, queueStats, tickets }` to `monthly_pull_log`
- Marks status `completed` with `completed_at = NOW()` and `progress_pct = 100`

## Error Handling

| Source | Behavior |
|--------|----------|
| Versature CDR fetch | Retries via `versatureFetch` (429 backoff, 401 token refresh). Day-level failure throws. |
| Queue stats | Per-queue `try/catch` — individual failures logged, others continue |
| ConnectWise | Entire fetch wrapped in `try/catch` — failure is non-fatal |
| syncDay | Per-day `try/catch` — failures collected, thrown as batch error at end |
| Overall | Outer `catch` marks `monthly_pull_log` as `failed` with error message |

## Progress Tracking

The `monthly_pull_log` table has three progress columns:

| Column | Type | Purpose |
|--------|------|---------|
| `progress_pct` | smallint | 0–100 completion percentage |
| `progress_message` | text | Human-readable phase description |
| `total_pages` | integer | Total days in the month (used as page proxy) |

The status endpoint `GET /api/jobs/monthly-pull/status?month=YYYY-MM` returns
these values and flags jobs as `stale: true` if in-progress for over 30 minutes.

## Environment Variables

All variables are set in `docker-compose.yml` and forwarded to the job-runner:

| Variable | Purpose |
|----------|---------|
| `TZ` | Container timezone (`America/Toronto`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `VERSATURE_BASE_URL` | Versature API base URL |
| `VERSATURE_CLIENT_ID` | OAuth client ID |
| `VERSATURE_CLIENT_SECRET` | OAuth client secret |
| `VERSATURE_API_VERSION` | Accept header version string |
| `CONNECTWISE_BASE_URL` | ConnectWise REST API base URL |
| `CONNECTWISE_CLIENT_ID` | ConnectWise client ID header |
| `CONNECTWISE_PUBLIC_KEY` | ConnectWise API public key |
| `CONNECTWISE_PRIVATE_KEY` | ConnectWise API private key |
| `CONNECTWISE_COMPANY_ID` | ConnectWise company identifier |
| `CONNECTWISE_SOURCE_ID` | Ticket source ID filter |
| `QUEUE_ENGLISH` | English queue ID |
| `QUEUE_FRENCH` | French queue ID |
| `QUEUE_AI_OVERFLOW_EN` | AI overflow English queue ID |
| `QUEUE_AI_OVERFLOW_FR` | AI overflow French queue ID |
| `DNIS_PRIMARY` | Primary DNIS for call matching |
| `DNIS_SECONDARY` | Secondary DNIS for call matching |
