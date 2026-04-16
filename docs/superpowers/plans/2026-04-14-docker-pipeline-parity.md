# Docker Pipeline Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Docker job-runner to full feature parity with the newer UI/background pull: add ConnectWise ticket integration, business-hours KPI snapshots, pull progress tracking, and write accurate documentation.

**Architecture:** The Docker job-runner (`job-runner/`) is an isolated Node.js process that shares `lib/` with the Next.js app via path aliases. Changes touch four areas: (1) a new `lib/connectwise/` client module for ticket fetching, (2) schema migrations adding `bh_kpis` and progress columns, (3) updates to `job-runner/pull.ts` and `job-runner/upsert.ts` for ConnectWise + progress + BH KPIs, and (4) documentation files describing the pipeline accurately.

**Tech Stack:** TypeScript, Node.js, PostgreSQL (pg), vitest, date-fns/date-fns-tz

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `lib/connectwise/auth.ts` | Build Basic auth header from env vars |
| Create | `lib/connectwise/client.ts` | Paginated ticket fetch from ConnectWise API |
| Create | `lib/connectwise/types.ts` | ConnectWise ticket type |
| Create | `db/migrations/003_pull_progress.sql` | Add `progress_pct`, `progress_message`, `total_pages` to `monthly_pull_log` |
| Create | `db/migrations/004_bh_kpis.sql` | Add `bh_kpis` column to `monthly_kpi_snapshots` |
| Modify | `job-runner/upsert.ts` | Add `upsertBhKpiSnapshot`, update `upsertKPISnapshot` signature |
| Modify | `job-runner/pull.ts` | Integrate ConnectWise tickets, progress tracking, BH KPIs |
| Modify | `docker-compose.yml` | No changes needed (CW env vars already present) |
| Create | `tests/connectwise/auth.test.ts` | Tests for CW auth header building |
| Create | `tests/connectwise/client.test.ts` | Tests for CW paginated fetch |
| Create | `tests/job-runner/pull.test.ts` | Tests for progress writes, CW integration, BH KPI writes |
| Create | `docs/PLATFORM.md` | Platform architecture overview |
| Create | `docs/docker-data-pipeline-report.md` | Docker pipeline deep-dive documentation |

---

### Task 1: ConnectWise Auth Module

**Files:**
- Create: `lib/connectwise/types.ts`
- Create: `lib/connectwise/auth.ts`
- Test: `tests/connectwise/auth.test.ts`

- [ ] **Step 1: Write the failing test for auth header building**

```ts
// tests/connectwise/auth.test.ts
import { describe, expect, test, vi, beforeEach } from 'vitest'

describe('buildConnectWiseHeaders', () => {
  beforeEach(() => {
    vi.stubEnv('CONNECTWISE_COMPANY_ID', 'testco')
    vi.stubEnv('CONNECTWISE_PUBLIC_KEY', 'pub123')
    vi.stubEnv('CONNECTWISE_PRIVATE_KEY', 'priv456')
    vi.stubEnv('CONNECTWISE_CLIENT_ID', 'client-abc')
  })

  test('builds Basic auth from company+public:private and includes clientId', async () => {
    const { buildConnectWiseHeaders } = await import('@/lib/connectwise/auth')
    const headers = buildConnectWiseHeaders()

    const expectedCredentials = Buffer.from('testco+pub123:priv456').toString('base64')
    expect(headers.Authorization).toBe(`Basic ${expectedCredentials}`)
    expect(headers.clientId).toBe('client-abc')
    expect(headers['Content-Type']).toBe('application/json')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd csh-dashboard && npx vitest run tests/connectwise/auth.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create types file**

```ts
// lib/connectwise/types.ts
export type ConnectWiseTicket = {
  id: number
  summary?: string
  dateEntered?: string
  contact?: { phoneNumber?: string }
  source?: { id?: number }
  [key: string]: unknown
}
```

- [ ] **Step 4: Write the auth module**

```ts
// lib/connectwise/auth.ts
export function buildConnectWiseHeaders() {
  const companyId = process.env.CONNECTWISE_COMPANY_ID!
  const publicKey = process.env.CONNECTWISE_PUBLIC_KEY!
  const privateKey = process.env.CONNECTWISE_PRIVATE_KEY!
  const clientId = process.env.CONNECTWISE_CLIENT_ID!

  const credentials = Buffer.from(`${companyId}+${publicKey}:${privateKey}`).toString('base64')

  return {
    Authorization: `Basic ${credentials}`,
    'Content-Type': 'application/json',
    clientId,
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd csh-dashboard && npx vitest run tests/connectwise/auth.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd csh-dashboard && git add lib/connectwise/types.ts lib/connectwise/auth.ts tests/connectwise/auth.test.ts
git commit -m "feat: add ConnectWise auth header builder"
```

---

### Task 2: ConnectWise Paginated Ticket Client

**Files:**
- Create: `lib/connectwise/client.ts`
- Test: `tests/connectwise/client.test.ts`

- [ ] **Step 1: Write the failing test for paginated ticket fetch**

```ts
// tests/connectwise/client.test.ts
import { describe, expect, test, vi, beforeEach } from 'vitest'

vi.mock('@/lib/connectwise/auth', () => ({
  buildConnectWiseHeaders: vi.fn().mockReturnValue({
    Authorization: 'Basic dGVzdA==',
    'Content-Type': 'application/json',
    clientId: 'test-client',
  }),
}))

describe('fetchTickets', () => {
  beforeEach(() => {
    vi.stubEnv('CONNECTWISE_BASE_URL', 'https://cw.example.com/v4_6_release/apis/3.0')
    vi.stubEnv('CONNECTWISE_SOURCE_ID', '12')
  })

  test('paginates until a short page is returned', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i, summary: `ticket-${i}` }))
    const page2 = [{ id: 100, summary: 'ticket-100' }, { id: 101, summary: 'ticket-101' }]

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => page1 })
      .mockResolvedValueOnce({ ok: true, json: async () => page2 })

    vi.stubGlobal('fetch', fetchMock)

    const { fetchTickets } = await import('@/lib/connectwise/client')
    const tickets = await fetchTickets('2026-03-01', '2026-03-31')

    expect(tickets).toHaveLength(102)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // Verify pagination query params
    const url1 = new URL(fetchMock.mock.calls[0][0])
    expect(url1.searchParams.get('page')).toBe('1')
    expect(url1.searchParams.get('pageSize')).toBe('100')
  })

  test('returns empty array when first page is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [] }))

    const { fetchTickets } = await import('@/lib/connectwise/client')
    const tickets = await fetchTickets('2026-03-01', '2026-03-31')

    expect(tickets).toHaveLength(0)
  })

  test('logs and stops pagination on non-OK response', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' }),
    )

    const { fetchTickets } = await import('@/lib/connectwise/client')
    const tickets = await fetchTickets('2026-03-01', '2026-03-31')

    expect(tickets).toHaveLength(0)
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd csh-dashboard && npx vitest run tests/connectwise/client.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the client module**

```ts
// lib/connectwise/client.ts
import { buildConnectWiseHeaders } from './auth'
import type { ConnectWiseTicket } from './types'

const PAGE_SIZE = 100

export async function fetchTickets(
  startDate: string,
  endDate: string,
): Promise<ConnectWiseTicket[]> {
  const baseUrl = process.env.CONNECTWISE_BASE_URL!
  const sourceId = process.env.CONNECTWISE_SOURCE_ID!
  const headers = buildConnectWiseHeaders()

  const conditions = `dateEntered >= [${startDate}] AND dateEntered <= [${endDate}] AND source/id=${sourceId}`
  const tickets: ConnectWiseTicket[] = []
  let page = 1

  while (true) {
    const url = `${baseUrl}/service/tickets?conditions=${encodeURIComponent(conditions)}&pageSize=${PAGE_SIZE}&page=${page}`

    const response = await fetch(url, { headers })

    if (!response.ok) {
      console.warn(`[connectwise] Request failed (${response.status}) on page ${page} — stopping pagination`)
      break
    }

    const data: ConnectWiseTicket[] = await response.json()

    if (data.length === 0) {
      break
    }

    tickets.push(...data)

    if (data.length < PAGE_SIZE) {
      break
    }

    page++
  }

  return tickets
}
```

- [ ] **Step 4: Delete the `.gitkeep` placeholder**

```bash
rm csh-dashboard/lib/connectwise/.gitkeep
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd csh-dashboard && npx vitest run tests/connectwise/client.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd csh-dashboard && git add lib/connectwise/ tests/connectwise/client.test.ts
git commit -m "feat: add ConnectWise paginated ticket client"
```

---

### Task 3: Database Migrations — Progress Tracking & BH KPIs

**Files:**
- Create: `db/migrations/003_pull_progress.sql`
- Create: `db/migrations/004_bh_kpis.sql`

- [ ] **Step 1: Create progress tracking migration**

```sql
-- db/migrations/003_pull_progress.sql
ALTER TABLE monthly_pull_log
  ADD COLUMN IF NOT EXISTS progress_pct smallint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress_message text,
  ADD COLUMN IF NOT EXISTS total_pages integer;
```

- [ ] **Step 2: Create bh_kpis migration**

```sql
-- db/migrations/004_bh_kpis.sql
ALTER TABLE monthly_kpi_snapshots
  ADD COLUMN IF NOT EXISTS bh_kpis jsonb;
```

- [ ] **Step 3: Commit**

```bash
cd csh-dashboard && git add db/migrations/003_pull_progress.sql db/migrations/004_bh_kpis.sql
git commit -m "feat: add progress tracking and bh_kpis schema migrations"
```

---

### Task 4: Update Upsert Module — BH KPIs & Ticket Integration

**Files:**
- Modify: `job-runner/upsert.ts:137-148` (add `upsertBhKpiSnapshot`, update `upsertKPISnapshot`)

- [ ] **Step 1: Write failing test for BH KPI upsert**

```ts
// tests/job-runner/upsert.test.ts
import { describe, expect, test, vi, beforeEach } from 'vitest'

// Mock the db module
const mockQuery = vi.fn().mockResolvedValue({ rows: [] })
vi.mock('../../job-runner/db', () => ({
  getPool: vi.fn().mockReturnValue({ query: mockQuery }),
  withTransaction: vi.fn(async (fn) => {
    return fn({ query: mockQuery })
  }),
}))

describe('upsertBhKpiSnapshot', () => {
  beforeEach(() => {
    mockQuery.mockClear()
  })

  test('inserts bh_kpis into monthly_kpi_snapshots', async () => {
    const { upsertBhKpiSnapshot } = await import('../../job-runner/upsert')
    const bhKpis = { kpi1: 100, kpi2: 5 }

    await upsertBhKpiSnapshot('2026-03', bhKpis)

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('bh_kpis'),
      ['2026-03', expect.any(String)],
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd csh-dashboard && npx vitest run tests/job-runner/upsert.test.ts`
Expected: FAIL — `upsertBhKpiSnapshot` is not exported

- [ ] **Step 3: Add `upsertBhKpiSnapshot` to `job-runner/upsert.ts`**

Add at the end of `job-runner/upsert.ts` (after the existing `upsertKPISnapshot`):

```ts
export async function upsertBhKpiSnapshot(month: string, bhKpis: Record<string, unknown>): Promise<void> {
  const { getPool } = await import('./db')
  const pool = getPool()
  await pool.query(
    `INSERT INTO monthly_kpi_snapshots (month, computed_at, kpis, bh_kpis)
    VALUES ($1, NOW(), '{}'::jsonb, $2)
    ON CONFLICT (month) DO UPDATE SET
      bh_kpis = EXCLUDED.bh_kpis`,
    [month, JSON.stringify(bhKpis)],
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd csh-dashboard && npx vitest run tests/job-runner/upsert.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd csh-dashboard && git add job-runner/upsert.ts tests/job-runner/upsert.test.ts
git commit -m "feat: add upsertBhKpiSnapshot for business-hours KPIs"
```

---

### Task 5: Add Progress Tracking Helper

**Files:**
- Modify: `job-runner/pull.ts` (add `updateProgress` helper function)

- [ ] **Step 1: Write failing test for progress updates**

```ts
// tests/job-runner/progress.test.ts
import { describe, expect, test, vi, beforeEach } from 'vitest'

const mockQuery = vi.fn().mockResolvedValue({ rows: [] })
vi.mock('../../job-runner/db', () => ({
  getPool: vi.fn().mockReturnValue({
    query: mockQuery,
    connect: vi.fn(),
  }),
  withTransaction: vi.fn(),
}))

describe('updateProgress', () => {
  beforeEach(() => {
    mockQuery.mockClear()
  })

  test('writes progress_pct, progress_message, and total_pages to monthly_pull_log', async () => {
    const { updateProgress } = await import('../../job-runner/pull')
    await updateProgress('2026-03', 45, 'Fetching CDRs for 2026-03-14…', 31)

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('progress_pct'),
      ['2026-03', 45, 'Fetching CDRs for 2026-03-14…', 31],
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd csh-dashboard && npx vitest run tests/job-runner/progress.test.ts`
Expected: FAIL — `updateProgress` not exported

- [ ] **Step 3: Add `updateProgress` to `job-runner/pull.ts`**

Add after the `sleep` function (around line 14):

```ts
export async function updateProgress(
  month: string,
  pct: number,
  message: string,
  totalPages?: number,
): Promise<void> {
  const pool = getPool()
  await pool.query(
    `UPDATE monthly_pull_log
     SET progress_pct = $2, progress_message = $3, total_pages = $4
     WHERE month = $1`,
    [month, pct, message, totalPages ?? null],
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd csh-dashboard && npx vitest run tests/job-runner/progress.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd csh-dashboard && git add job-runner/pull.ts tests/job-runner/progress.test.ts
git commit -m "feat: add updateProgress helper for pull progress tracking"
```

---

### Task 6: Integrate ConnectWise, Progress, and BH KPIs into Pull Flow

**Files:**
- Modify: `job-runner/pull.ts:1-189` (the main `runMonthlyPull` function)

This is the core integration task. We modify the pull flow to:
1. Write progress updates at each phase
2. Fetch ConnectWise tickets after queue stats
3. Compute and store BH KPIs alongside regular KPIs

- [ ] **Step 1: Add ConnectWise and BH KPI imports to `job-runner/pull.ts`**

Replace the existing imports block (lines 1-8) with:

```ts
import { formatInTimeZone } from 'date-fns-tz'
import { startOfMonth, endOfMonth, subMonths, format, eachDayOfInterval } from 'date-fns'
import { getDomainCdrs, getQueueStats } from '@/lib/versature/endpoints'
import { ENGLISH_QUEUE_ID, FRENCH_QUEUE_ID, AI_OVERFLOW_QUEUE_IDS } from '@/lib/versature/queues'
import { getDashboardData } from '@/lib/kpis/get-dashboard-data'
import { fetchTickets } from '@/lib/connectwise/client'
import { syncDay } from '@/lib/versature/sync'
import { getPool } from './db'
import { upsertCDRBatch, upsertQueueStats, upsertTicketBatch, upsertKPISnapshot, upsertBhKpiSnapshot, type QueueStatsRow } from './upsert'
```

- [ ] **Step 2: Add progress calls and ConnectWise fetch to `runMonthlyPull`**

Replace the try block body inside `runMonthlyPull` (lines 86-178) with:

```ts
    console.log(`[pull] Starting monthly pull for ${month} (${startDate} → ${endDate})`)
    const totalDays = days.length
    // Phases: CDRs (0-30%), Queue Stats (30-40%), ConnectWise (40-55%),
    //         Sync (55-80%), KPI Compute (80-95%), Finalize (95-100%)

    // === FETCH CDRs ===
    const allCdrs: Awaited<ReturnType<typeof getDomainCdrs>> = []

    for (let i = 0; i < days.length; i++) {
      const dayStr = format(days[i], 'yyyy-MM-dd')
      const pct = Math.round((i / totalDays) * 30)
      await updateProgress(month, pct, `Fetching CDRs for ${dayStr}…`, totalDays)

      console.log(`[pull] Fetching CDRs for ${dayStr}…`)
      const dayCdrs = await getDomainCdrs(dayStr, dayStr)
      allCdrs.push(...dayCdrs)
      console.log(`[pull]   → ${dayCdrs.length} CDRs`)
      await sleep(3000)
    }

    console.log(`[pull] Upserting ${allCdrs.length} CDRs…`)
    await updateProgress(month, 30, `Upserting ${allCdrs.length} CDRs…`)
    await upsertCDRBatch(allCdrs, month)

    // === FETCH QUEUE STATS ===
    const queueIds = [ENGLISH_QUEUE_ID, FRENCH_QUEUE_ID, ...AI_OVERFLOW_QUEUE_IDS]
    let queueStatsCount = 0

    for (let i = 0; i < queueIds.length; i++) {
      const qid = queueIds[i]
      const pct = 30 + Math.round(((i + 1) / queueIds.length) * 10)
      await updateProgress(month, pct, `Fetching queue stats for ${qid}…`)

      console.log(`[pull] Fetching queue stats for ${qid}…`)
      try {
        const stats = await getQueueStats(qid, startDate, endDate) as unknown as QueueStatsRow
        if (stats) {
          await upsertQueueStats(stats, qid, month)
          queueStatsCount++
        }
      } catch (err) {
        console.warn(`[pull] Queue stats failed for ${qid}:`, err)
      }
      await sleep(500)
    }

    // === FETCH CONNECTWISE TICKETS ===
    let tickets: Awaited<ReturnType<typeof fetchTickets>> = []
    await updateProgress(month, 42, 'Fetching ConnectWise tickets…')
    console.log(`[pull] Fetching ConnectWise tickets…`)

    try {
      tickets = await fetchTickets(startDate, endDate)
      console.log(`[pull]   → ${tickets.length} tickets`)

      if (tickets.length > 0) {
        await updateProgress(month, 50, `Upserting ${tickets.length} tickets…`)
        await upsertTicketBatch(tickets, month)
      }
    } catch (err) {
      // ConnectWise failure is non-fatal — log and continue
      console.warn('[pull] ConnectWise ticket fetch failed (non-fatal):', err)
    }

    await updateProgress(month, 55, 'Syncing into Part 1 tables…')

    // === SYNC INTO PART 1 TABLES ===
    console.log(`[pull] Syncing into Part 1 tables for KPI computation…`)
    const failedDays: string[] = []
    for (let i = 0; i < days.length; i++) {
      const dayStr = format(days[i], 'yyyy-MM-dd')
      const pct = 55 + Math.round(((i + 1) / totalDays) * 25)
      await updateProgress(month, pct, `Syncing ${dayStr}…`)

      try {
        await syncDay(days[i])
      } catch (err) {
        failedDays.push(dayStr)
        console.warn(`[pull] syncDay failed for ${dayStr}:`, err)
      }
      await sleep(3000)
    }

    if (failedDays.length > 0) {
      throw new Error(`syncDay failed for ${failedDays.length} day(s): ${failedDays.join(', ')}`)
    }

    // === COMPUTE KPI SNAPSHOTS ===
    await updateProgress(month, 82, 'Computing KPI snapshots…')
    console.log(`[pull] Computing KPI snapshots…`)
    const period = {
      start: new Date(`${startDate}T00:00:00`),
      end: new Date(`${endDate}T23:59:59`),
    }

    // Full KPIs (includes weekends)
    const kpiData = await getDashboardData(period, { includeWeekends: false })
    await upsertKPISnapshot(month, {
      ...kpiData,
      dataSource: 'historical',
      lastUpdated: new Date().toISOString(),
    })

    // Business-hours KPIs (weekdays only, same computation with includeWeekends: false)
    await updateProgress(month, 90, 'Computing business-hours KPI snapshot…')
    const bhKpiData = await getDashboardData(period, { includeWeekends: false })
    await upsertBhKpiSnapshot(month, {
      ...bhKpiData,
      dataSource: 'historical',
      lastUpdated: new Date().toISOString(),
    })

    // === FINALIZE ===
    await updateProgress(month, 95, 'Finalizing…')

    const recordCounts = {
      cdrs: allCdrs.length,
      queueStats: queueStatsCount,
      tickets: tickets.length,
    }

    const durationMs = Date.now() - jobStart
    const duration = `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`

    await pool.query(
      `UPDATE monthly_pull_log
       SET status = 'completed', completed_at = NOW(), record_counts = $2, progress_pct = 100, progress_message = 'Complete'
       WHERE month = $1`,
      [month, JSON.stringify(recordCounts)],
    )

    console.log(`[pull] Completed in ${duration}: ${JSON.stringify(recordCounts)}`)
    return { status: 'completed', pulledAt: new Date().toISOString(), duration, recordCounts }
```

- [ ] **Step 3: Run existing tests to check nothing is broken**

Run: `cd csh-dashboard && npx vitest run`
Expected: All existing tests PASS

- [ ] **Step 4: Commit**

```bash
cd csh-dashboard && git add job-runner/pull.ts
git commit -m "feat: integrate ConnectWise tickets, progress tracking, and BH KPIs into Docker pull"
```

---

### Task 7: Update Pull Status Endpoint for Progress Fields

**Files:**
- Modify: `app/api/jobs/monthly-pull/status/route.ts`

- [ ] **Step 1: Add progress fields to the status response**

Update the return payload in `app/api/jobs/monthly-pull/status/route.ts` to include the new progress columns:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db/client'
import { formatInTimeZone } from 'date-fns-tz'
import { subMonths, startOfMonth } from 'date-fns'

function getPreviousMonth(): string {
  return formatInTimeZone(
    startOfMonth(subMonths(new Date(), 1)),
    'America/Toronto',
    'yyyy-MM',
  )
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const month = req.nextUrl.searchParams.get('month') ?? getPreviousMonth()

  try {
    const result = await getPool().query(
      'SELECT status, started_at, completed_at, record_counts, error, progress_pct, progress_message, total_pages FROM monthly_pull_log WHERE month = $1',
      [month],
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ status: 'not_pulled', month })
    }

    const row = result.rows[0]
    const rc = row.record_counts as { cdrs: number; queueStats: number; tickets: number } | null

    // Mark stale jobs: if in_progress for > 30 minutes, flag as potentially stale
    let stale = false
    if (row.status === 'in_progress' && row.started_at) {
      const elapsed = Date.now() - new Date(row.started_at).getTime()
      stale = elapsed > 30 * 60 * 1000
    }

    return NextResponse.json({
      status: row.status as string,
      month,
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : undefined,
      pulledAt: row.completed_at ? new Date(row.completed_at).toISOString() : undefined,
      recordCounts: rc ?? undefined,
      error: row.error ?? undefined,
      progressPct: row.progress_pct ?? 0,
      progressMessage: row.progress_message ?? undefined,
      totalPages: row.total_pages ?? undefined,
      stale,
    })
  } catch {
    return NextResponse.json({ status: 'not_pulled', month })
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd csh-dashboard && git add app/api/jobs/monthly-pull/status/route.ts
git commit -m "feat: expose progress tracking fields in pull status endpoint"
```

---

### Task 8: Write PLATFORM.md Documentation

**Files:**
- Create: `docs/PLATFORM.md`

- [ ] **Step 1: Write PLATFORM.md**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
cd csh-dashboard && git add docs/PLATFORM.md
git commit -m "docs: add PLATFORM.md architecture overview"
```

---

### Task 9: Write docker-data-pipeline-report.md Documentation

**Files:**
- Create: `docs/docker-data-pipeline-report.md`

- [ ] **Step 1: Write docker-data-pipeline-report.md**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
cd csh-dashboard && git add docs/docker-data-pipeline-report.md
git commit -m "docs: add Docker data pipeline technical report"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `cd csh-dashboard && npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Type-check the job-runner**

Run: `cd csh-dashboard/job-runner && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Type-check the Next.js app**

Run: `cd csh-dashboard && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit any remaining fixes**

If any type or test issues were found and fixed, commit them:

```bash
cd csh-dashboard && git add -A && git commit -m "fix: resolve type/test issues from pipeline parity work"
```
