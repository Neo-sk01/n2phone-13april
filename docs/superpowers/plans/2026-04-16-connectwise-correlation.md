# ConnectWise Correlation & AI Voice Assist Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correlate Versature AI-queue calls with ConnectWise tickets and expose four new KPIs (#11–14) plus an "AI Voice Assist Health" UI section.

**Architecture:** Add a `/cdrs/users/` fetch path for calls hitting AI-overflow extensions (`to.user` ∈ {`QUEUE_AI_OVERFLOW_EN`, `QUEUE_AI_OVERFLOW_FR`}) into a new `ai_candidate_calls` table. Enrich the existing `tickets` table with `normalized_phone`, `status`, `resolved_date_time`, `sla_status`, `merged_into_ticket_id`. A pure correlation function matches calls to tickets by (phone, time-window). Results land in `connectwise_correlations`. Four KPIs read from these three tables; UI gets a new dashboard section.

**Tech Stack:** Next.js 15, PostgreSQL, node-pg, vitest, date-fns / date-fns-tz, Tailwind CSS.

**Decision notes:**
- Enriching the existing `tickets` table (single source of truth) rather than a parallel `connectwise_tickets` table — spec divergence noted to user and approved ("do what you think is best").
- Correlation is a pure function taking `(call, tickets[])` to keep it testable without DB fixtures; a thin runner does DB reads/writes.
- AI-queue extension IDs come from env (`QUEUE_AI_OVERFLOW_EN` / `_FR`) — no hardcoded `8030/8031`.

---

## File Structure

**New files:**
- `lib/utils/phone.ts` — `normalizePhone(raw)` → E.164-ish digits-only or null
- `lib/connectwise/correlate.ts` — pure `correlateCall(call, tickets, now)` → `{ticketId, confidence, reason}`
- `lib/connectwise/runner.ts` — DB-side orchestration: load candidates + tickets → run correlator → upsert results
- `lib/versature/cdrs-users.ts` — `getCdrsForUsers(userIds, startDate, endDate)` with cursor pagination + 429 backoff
- `lib/kpis/kpi-11-correlation-rate.ts`
- `lib/kpis/kpi-12-unmatched-calls.ts`
- `lib/kpis/kpi-13-sla-compliance.ts`
- `lib/kpis/kpi-14-resolution-time.ts`
- `app/components/VoiceAssistHealth.tsx` — the new dashboard section
- `app/components/SlaComplianceChart.tsx`
- `app/components/UncorrelatedCallsTable.tsx`
- `app/components/InfoButton.tsx` — reusable "ⓘ" trigger + popover
- `db/migrations/005_connectwise_correlation.sql`
- Test files mirroring each above in `tests/…`

**Modified files:**
- `lib/connectwise/client.ts` — request `resolvedDateTime`, `status`, `mergedIntoTicketId`, `closedFlag`
- `lib/connectwise/types.ts` — extend `ConnectWiseTicket`
- `job-runner/upsert.ts` — extend `upsertTicketBatch`; add `upsertAiCandidateCalls`, `upsertCorrelations`
- `job-runner/pull.ts` — wire AI CDR fetch + correlation step into monthly pull
- `lib/kpis/get-dashboard-data.ts` — register KPIs 11–14
- `lib/versature/types.ts` — export narrowed `AiCandidateCall` type
- `app/page.tsx` — replace the placeholder section with `<VoiceAssistHealth />`

---

## Part A: Data Foundation

### Task 1: Phone normalization utility

**Files:**
- Create: `lib/utils/phone.ts`
- Test: `tests/utils/phone.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/utils/phone.test.ts
import { describe, expect, test } from 'vitest'
import { normalizePhone } from '@/lib/utils/phone'

describe('normalizePhone', () => {
  test('strips formatting from NANP numbers', () => {
    expect(normalizePhone('(416) 555-0100')).toBe('14165550100')
    expect(normalizePhone('416-555-0100')).toBe('14165550100')
    expect(normalizePhone('416.555.0100')).toBe('14165550100')
    expect(normalizePhone('4165550100')).toBe('14165550100')
  })

  test('preserves leading 1 when already present', () => {
    expect(normalizePhone('1-416-555-0100')).toBe('14165550100')
    expect(normalizePhone('+14165550100')).toBe('14165550100')
  })

  test('returns null for empty/invalid input', () => {
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
    expect(normalizePhone(undefined)).toBeNull()
    expect(normalizePhone('abc')).toBeNull()
    expect(normalizePhone('123')).toBeNull() // too short
  })

  test('handles extensions by discarding them', () => {
    expect(normalizePhone('416-555-0100 x123')).toBe('14165550100')
    expect(normalizePhone('4165550100;ext=5')).toBe('14165550100')
  })

  test('returns null when digits count is invalid', () => {
    expect(normalizePhone('12345')).toBeNull()
    expect(normalizePhone('123456789012345')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify FAIL**

```
npx vitest run tests/utils/phone.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// lib/utils/phone.ts
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  // Drop anything after an extension marker
  const trimmed = String(raw).split(/[x;]/i)[0]
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 10) return `1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return digits
  return null
}
```

- [ ] **Step 4: Run tests — PASS**

```
npx vitest run tests/utils/phone.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/utils/phone.ts tests/utils/phone.test.ts
git commit -m "feat(utils): add phone normalization helper for correlation"
```

---

### Task 2: Migration 005 — ai_candidate_calls, tickets enrichment, connectwise_correlations

**Files:**
- Create: `db/migrations/005_connectwise_correlation.sql`

- [ ] **Step 1: Write migration**

```sql
-- db/migrations/005_connectwise_correlation.sql

-- Raw calls that hit AI-overflow extensions, pulled via /cdrs/users/
create table if not exists ai_candidate_calls (
  cdr_id            text      not null,
  month             char(7)   not null,
  to_user           text      not null,                  -- ext id (e.g. 8030)
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
alter table tickets add column if not exists sla_status text;          -- 'met' | 'breached' | 'unknown'
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
  confidence    text    not null,                        -- 'exact' | 'fuzzy' | 'none'
  reason        text,
  created_at    timestamptz not null default now(),
  primary key (cdr_id, month, ticket_id)
);

create index if not exists idx_correlations_month on connectwise_correlations (month);
create index if not exists idx_correlations_ticket on connectwise_correlations (ticket_id);
```

- [ ] **Step 2: Apply migration to local dev DB**

```
npm run migrate
```
Expected: "Applied 005_connectwise_correlation.sql"

- [ ] **Step 3: Commit**

```bash
git add db/migrations/005_connectwise_correlation.sql
git commit -m "feat(db): migration 005 — ai_candidate_calls, ticket enrichment, correlations"
```

---

### Task 3: Extend ConnectWise fetch + types for correlation fields

**Files:**
- Modify: `lib/connectwise/types.ts`
- Modify: `lib/connectwise/client.ts`
- Test: `tests/connectwise/client.test.ts` (add a case)

- [ ] **Step 1: Add failing test**

Append to `tests/connectwise/client.test.ts`:

```typescript
test('requests the enriched fields list', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [] })
  vi.stubGlobal('fetch', fetchMock)

  const { fetchTickets } = await import('@/lib/connectwise/client')
  await fetchTickets('2026-03-01', '2026-03-31')

  const url = new URL(fetchMock.mock.calls[0][0])
  const fields = url.searchParams.get('fields') ?? ''
  expect(fields).toContain('id')
  expect(fields).toContain('status/name')
  expect(fields).toContain('resolvedDateTime')
  expect(fields).toContain('mergedIntoTicket/id')
  expect(fields).toContain('contact/phoneNumber')
})
```

- [ ] **Step 2: Run — FAIL (no `fields` param yet)**

```
npx vitest run tests/connectwise/client.test.ts
```

- [ ] **Step 3: Extend type**

```typescript
// lib/connectwise/types.ts
export type ConnectWiseTicket = {
  id: number
  summary?: string
  dateEntered?: string
  contact?: { phoneNumber?: string }
  source?: { id?: number }
  status?: { name?: string }
  resolvedDateTime?: string
  mergedIntoTicket?: { id?: number }
  closedFlag?: boolean
  [key: string]: unknown
}
```

- [ ] **Step 4: Update client**

```typescript
// lib/connectwise/client.ts
import { buildConnectWiseHeaders } from './auth'
import type { ConnectWiseTicket } from './types'

const PAGE_SIZE = 100
const FIELDS = [
  'id',
  'summary',
  'dateEntered',
  'contact/phoneNumber',
  'source/id',
  'status/name',
  'resolvedDateTime',
  'mergedIntoTicket/id',
  'closedFlag',
].join(',')

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
    const url =
      `${baseUrl}/service/tickets` +
      `?conditions=${encodeURIComponent(conditions)}` +
      `&fields=${encodeURIComponent(FIELDS)}` +
      `&pageSize=${PAGE_SIZE}&page=${page}`

    const response = await fetch(url, { headers })
    if (!response.ok) {
      console.warn(`[connectwise] Request failed (${response.status}) on page ${page} — stopping pagination`)
      break
    }

    const data = (await response.json()) as ConnectWiseTicket[]
    if (data.length === 0) break
    tickets.push(...data)
    if (data.length < PAGE_SIZE) break
    page++
  }

  return tickets
}
```

- [ ] **Step 5: Run all connectwise tests — PASS**

```
npx vitest run tests/connectwise/
```

- [ ] **Step 6: Extend ticket upsert**

In `job-runner/upsert.ts`, replace `upsertTicketBatch` with:

```typescript
export type TicketRow = {
  id: number
  summary?: string
  dateEntered?: string
  contact?: { phoneNumber?: string }
  source?: { id?: number }
  status?: { name?: string }
  resolvedDateTime?: string
  mergedIntoTicket?: { id?: number }
  closedFlag?: boolean
  [key: string]: unknown
}

export async function upsertTicketBatch(tickets: TicketRow[], month: string): Promise<void> {
  const { normalizePhone } = await import('@/lib/utils/phone')
  for (let i = 0; i < tickets.length; i += BATCH) {
    const chunk = tickets.slice(i, i + BATCH)
    await withTransaction(async (client: PoolClient) => {
      for (const t of chunk) {
        const phone = t.contact?.phoneNumber ?? null
        await client.query(
          `INSERT INTO tickets
            (id, month, summary, date_entered, phone_number, source_id,
             normalized_phone, status, resolved_date_time,
             merged_into_ticket_id, closed_flag, raw)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          ON CONFLICT (id, month) DO UPDATE SET
            summary              = EXCLUDED.summary,
            date_entered         = EXCLUDED.date_entered,
            normalized_phone     = EXCLUDED.normalized_phone,
            status               = EXCLUDED.status,
            resolved_date_time   = EXCLUDED.resolved_date_time,
            merged_into_ticket_id= EXCLUDED.merged_into_ticket_id,
            closed_flag          = EXCLUDED.closed_flag,
            raw                  = EXCLUDED.raw`,
          [
            t.id,
            month,
            t.summary ?? null,
            t.dateEntered ? new Date(t.dateEntered) : null,
            phone,
            t.source?.id ?? null,
            normalizePhone(phone),
            t.status?.name ?? null,
            t.resolvedDateTime ? new Date(t.resolvedDateTime) : null,
            t.mergedIntoTicket?.id ?? null,
            t.closedFlag ?? null,
            JSON.stringify(t),
          ],
        )
      }
    })
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add lib/connectwise/client.ts lib/connectwise/types.ts tests/connectwise/client.test.ts job-runner/upsert.ts
git commit -m "feat(connectwise): fetch + upsert enriched ticket fields for correlation"
```

---

### Task 4: Versature `/cdrs/users/` fetch helper

**Files:**
- Create: `lib/versature/cdrs-users.ts`
- Test: `tests/versature/cdrs-users.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/versature/cdrs-users.test.ts
import { describe, expect, test, vi, beforeEach } from 'vitest'

vi.mock('@/lib/versature/client', () => ({
  versatureFetch: vi.fn(),
}))

describe('getCdrsForUsers', () => {
  beforeEach(() => vi.clearAllMocks())

  test('queries each user id and concatenates results', async () => {
    const { versatureFetch } = await import('@/lib/versature/client')
    const mock = vi.mocked(versatureFetch)
    mock
      .mockResolvedValueOnce([{ id: 'a', to: { user: '8030' } }])
      .mockResolvedValueOnce([{ id: 'b', to: { user: '8031' } }])

    const { getCdrsForUsers } = await import('@/lib/versature/cdrs-users')
    const calls = await getCdrsForUsers(['8030', '8031'], '2026-03-01', '2026-03-31')

    expect(calls).toHaveLength(2)
    expect(calls.map((c) => c.id).sort()).toEqual(['a', 'b'])
    expect(mock).toHaveBeenCalledTimes(2)
    expect(mock.mock.calls[0][0]).toContain('to.user=8030')
    expect(mock.mock.calls[1][0]).toContain('to.user=8031')
  })

  test('paginates while pages are full', async () => {
    const { versatureFetch } = await import('@/lib/versature/client')
    const full = Array.from({ length: 20 }, (_, i) => ({ id: `p1-${i}`, to: { user: '8030' } }))
    const short = [{ id: 'p2-0', to: { user: '8030' } }]
    vi.mocked(versatureFetch).mockResolvedValueOnce(full).mockResolvedValueOnce(short)

    const { getCdrsForUsers } = await import('@/lib/versature/cdrs-users')
    const calls = await getCdrsForUsers(['8030'], '2026-03-01', '2026-03-31', { pageLimit: 20 })

    expect(calls).toHaveLength(21)
    expect(vi.mocked(versatureFetch)).toHaveBeenCalledTimes(2)
  })

  test('skips user on thrown error and continues', async () => {
    const { versatureFetch } = await import('@/lib/versature/client')
    vi.mocked(versatureFetch)
      .mockRejectedValueOnce(new Error('429'))
      .mockResolvedValueOnce([{ id: 'ok', to: { user: '8031' } }])

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { getCdrsForUsers } = await import('@/lib/versature/cdrs-users')
    const calls = await getCdrsForUsers(['8030', '8031'], '2026-03-01', '2026-03-31')

    expect(calls).toHaveLength(1)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
```

- [ ] **Step 2: Run — FAIL**

```
npx vitest run tests/versature/cdrs-users.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// lib/versature/cdrs-users.ts
import { versatureFetch } from './client'
import type { VersatureCdr } from './types'

export interface GetCdrsForUsersOptions {
  pageLimit?: number
  pauseMs?: number
}

export async function getCdrsForUsers(
  userIds: string[],
  startDate: string,
  endDate: string,
  options: GetCdrsForUsersOptions = {},
): Promise<VersatureCdr[]> {
  const { pageLimit = 500, pauseMs = 3000 } = options
  const all: VersatureCdr[] = []

  for (const userId of userIds) {
    let page = 1
    while (true) {
      try {
        const data = (await versatureFetch(
          `/cdrs/users/?to.user=${encodeURIComponent(userId)}` +
            `&start_date=${startDate}&end_date=${endDate}` +
            `&limit=${pageLimit}&page=${page}`,
        )) as VersatureCdr[]

        if (!Array.isArray(data) || data.length === 0) break
        all.push(...data)
        if (data.length < pageLimit) break
        await new Promise((r) => setTimeout(r, pauseMs))
        page++
      } catch (err) {
        console.warn(`[cdrs-users] Fetch failed for user ${userId} page ${page}:`, err)
        break
      }
    }
  }

  return all
}
```

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Add upsert function to `job-runner/upsert.ts`**

```typescript
export async function upsertAiCandidateCalls(
  cdrs: VersatureCdr[],
  month: string,
): Promise<void> {
  const { normalizePhone } = await import('@/lib/utils/phone')
  for (let i = 0; i < cdrs.length; i += BATCH) {
    const chunk = cdrs.slice(i, i + BATCH)
    await withTransaction(async (client: PoolClient) => {
      for (const c of chunk) {
        const id = c.id ?? c.from?.call_id ?? `${c.start_time}-${c.from?.id ?? 'unknown'}`
        const fromNumber = c.from?.number ?? c.from?.id ?? null
        await client.query(
          `INSERT INTO ai_candidate_calls
            (cdr_id, month, to_user, from_number, normalized_phone,
             start_time, answer_time, end_time, duration, raw)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          ON CONFLICT (cdr_id, month) DO UPDATE SET
            normalized_phone = EXCLUDED.normalized_phone,
            answer_time      = EXCLUDED.answer_time,
            end_time         = EXCLUDED.end_time,
            duration         = EXCLUDED.duration,
            raw              = EXCLUDED.raw`,
          [
            id,
            month,
            c.to?.user ?? '',
            fromNumber,
            normalizePhone(fromNumber),
            c.start_time ? new Date(c.start_time) : null,
            c.answer_time ? new Date(c.answer_time) : null,
            c.end_time ? new Date(c.end_time) : null,
            c.duration ?? null,
            JSON.stringify(c),
          ],
        )
      }
    })
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/versature/cdrs-users.ts tests/versature/cdrs-users.test.ts job-runner/upsert.ts
git commit -m "feat(versature): /cdrs/users/ fetch + ai_candidate_calls upsert"
```

---

### Task 5: Pure correlation function

**Files:**
- Create: `lib/connectwise/correlate.ts`
- Test: `tests/connectwise/correlate.test.ts`

Correlation rule (match in descending confidence):
1. **`exact`** — ticket has same `normalized_phone` AND `date_entered` is within `[call.start_time - 5m, call.start_time + 30m]`.
2. **`fuzzy`** — same `normalized_phone`, `date_entered` within `[call.start_time - 1h, call.start_time + 4h]`, and ticket has no better exact match yet.
3. Otherwise `none`.

Multiple calls may resolve to the same ticket; that's fine (stored 1-row per (cdr, ticket)).

- [ ] **Step 1: Write failing test**

```typescript
// tests/connectwise/correlate.test.ts
import { describe, expect, test } from 'vitest'
import { correlateCall } from '@/lib/connectwise/correlate'

type T = Parameters<typeof correlateCall>[1][number]
const ticket = (over: Partial<T>): T => ({
  id: 1,
  normalizedPhone: '14165550100',
  dateEntered: new Date('2026-03-15T10:00:00Z'),
  ...over,
})

describe('correlateCall', () => {
  const call = {
    cdrId: 'c1',
    normalizedPhone: '14165550100',
    startTime: new Date('2026-03-15T09:58:00Z'),
  }

  test('exact match: same phone, within -5m..+30m window', () => {
    const r = correlateCall(call, [ticket({})])
    expect(r).toEqual({ ticketId: 1, confidence: 'exact', reason: expect.any(String) })
  })

  test('fuzzy match: same phone, within -1h..+4h but outside exact window', () => {
    const r = correlateCall(call, [
      ticket({ dateEntered: new Date('2026-03-15T13:00:00Z') }),
    ])
    expect(r.confidence).toBe('fuzzy')
  })

  test('no match: same phone but > 4h away', () => {
    const r = correlateCall(call, [
      ticket({ dateEntered: new Date('2026-03-15T18:00:00Z') }),
    ])
    expect(r.confidence).toBe('none')
  })

  test('no match: different phone', () => {
    const r = correlateCall(call, [ticket({ normalizedPhone: '14165550200' })])
    expect(r.confidence).toBe('none')
  })

  test('prefers exact over fuzzy when both present', () => {
    const r = correlateCall(call, [
      ticket({ id: 99, dateEntered: new Date('2026-03-15T13:00:00Z') }),   // fuzzy
      ticket({ id: 42 }),                                                   // exact
    ])
    expect(r).toMatchObject({ ticketId: 42, confidence: 'exact' })
  })

  test('picks the closest ticket when multiple fuzzy candidates exist', () => {
    const r = correlateCall(call, [
      ticket({ id: 1, dateEntered: new Date('2026-03-15T13:00:00Z') }),
      ticket({ id: 2, dateEntered: new Date('2026-03-15T11:30:00Z') }),
    ])
    expect(r).toMatchObject({ ticketId: 2, confidence: 'fuzzy' })
  })

  test('skips tickets without normalized phone', () => {
    const r = correlateCall(call, [ticket({ normalizedPhone: null })])
    expect(r.confidence).toBe('none')
  })

  test('skips calls without normalized phone', () => {
    const r = correlateCall({ ...call, normalizedPhone: null }, [ticket({})])
    expect(r.confidence).toBe('none')
  })
})
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```typescript
// lib/connectwise/correlate.ts
export interface CallForCorrelation {
  cdrId: string
  normalizedPhone: string | null
  startTime: Date
}

export interface TicketForCorrelation {
  id: number
  normalizedPhone: string | null
  dateEntered: Date | null
}

export type Confidence = 'exact' | 'fuzzy' | 'none'

export interface CorrelationResult {
  ticketId: number | null
  confidence: Confidence
  reason: string
}

const EXACT_WINDOW_BEFORE_MS = 5 * 60_000
const EXACT_WINDOW_AFTER_MS = 30 * 60_000
const FUZZY_WINDOW_BEFORE_MS = 60 * 60_000
const FUZZY_WINDOW_AFTER_MS = 4 * 60 * 60_000

export function correlateCall(
  call: CallForCorrelation,
  tickets: TicketForCorrelation[],
): CorrelationResult {
  if (!call.normalizedPhone) {
    return { ticketId: null, confidence: 'none', reason: 'call missing phone' }
  }

  const candidates = tickets.filter(
    (t) => t.normalizedPhone === call.normalizedPhone && t.dateEntered != null,
  )
  if (candidates.length === 0) {
    return { ticketId: null, confidence: 'none', reason: 'no ticket with matching phone' }
  }

  const callMs = call.startTime.getTime()
  let bestExact: { ticket: TicketForCorrelation; delta: number } | null = null
  let bestFuzzy: { ticket: TicketForCorrelation; delta: number } | null = null

  for (const t of candidates) {
    const delta = t.dateEntered!.getTime() - callMs
    const abs = Math.abs(delta)
    if (delta >= -EXACT_WINDOW_BEFORE_MS && delta <= EXACT_WINDOW_AFTER_MS) {
      if (!bestExact || abs < Math.abs(bestExact.delta)) bestExact = { ticket: t, delta }
    } else if (delta >= -FUZZY_WINDOW_BEFORE_MS && delta <= FUZZY_WINDOW_AFTER_MS) {
      if (!bestFuzzy || abs < Math.abs(bestFuzzy.delta)) bestFuzzy = { ticket: t, delta }
    }
  }

  if (bestExact) {
    return {
      ticketId: bestExact.ticket.id,
      confidence: 'exact',
      reason: `Δ ${Math.round(bestExact.delta / 60000)}m within exact window`,
    }
  }
  if (bestFuzzy) {
    return {
      ticketId: bestFuzzy.ticket.id,
      confidence: 'fuzzy',
      reason: `Δ ${Math.round(bestFuzzy.delta / 60000)}m within fuzzy window`,
    }
  }
  return { ticketId: null, confidence: 'none', reason: 'phone matched but no time-window match' }
}
```

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add lib/connectwise/correlate.ts tests/connectwise/correlate.test.ts
git commit -m "feat(connectwise): pure call↔ticket correlation function"
```

---

### Task 6: Correlation runner (DB orchestration)

**Files:**
- Create: `lib/connectwise/runner.ts`
- Test: `tests/connectwise/runner.test.ts`
- Modify: `job-runner/upsert.ts` — add `upsertCorrelations`

- [ ] **Step 1: Add `upsertCorrelations` to `job-runner/upsert.ts`**

```typescript
export interface CorrelationRow {
  cdrId: string
  ticketId: number | null
  confidence: 'exact' | 'fuzzy' | 'none'
  reason: string
}

export async function upsertCorrelations(
  rows: CorrelationRow[],
  month: string,
): Promise<void> {
  const matched = rows.filter((r) => r.ticketId !== null)
  for (let i = 0; i < matched.length; i += BATCH) {
    const chunk = matched.slice(i, i + BATCH)
    await withTransaction(async (client: PoolClient) => {
      for (const r of chunk) {
        await client.query(
          `INSERT INTO connectwise_correlations (cdr_id, month, ticket_id, confidence, reason)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (cdr_id, month, ticket_id) DO UPDATE SET
             confidence = EXCLUDED.confidence,
             reason     = EXCLUDED.reason`,
          [r.cdrId, month, r.ticketId, r.confidence, r.reason],
        )
      }
    })
  }
}
```

- [ ] **Step 2: Test for the runner (pure functional core)**

```typescript
// tests/connectwise/runner.test.ts
import { describe, expect, test } from 'vitest'
import { correlateAll } from '@/lib/connectwise/runner'

describe('correlateAll', () => {
  test('maps each call through correlateCall and preserves cdrId', () => {
    const calls = [
      { cdrId: 'a', normalizedPhone: '14165550100', startTime: new Date('2026-03-15T09:58:00Z') },
      { cdrId: 'b', normalizedPhone: '14165550200', startTime: new Date('2026-03-15T10:00:00Z') },
    ]
    const tickets = [
      { id: 1, normalizedPhone: '14165550100', dateEntered: new Date('2026-03-15T10:00:00Z') },
    ]

    const rows = correlateAll(calls, tickets)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ cdrId: 'a', ticketId: 1, confidence: 'exact' })
    expect(rows[1]).toMatchObject({ cdrId: 'b', ticketId: null, confidence: 'none' })
  })
})
```

- [ ] **Step 3: Implement runner**

```typescript
// lib/connectwise/runner.ts
import { correlateCall, type CallForCorrelation, type TicketForCorrelation } from './correlate'

export interface CorrelationRowOut {
  cdrId: string
  ticketId: number | null
  confidence: 'exact' | 'fuzzy' | 'none'
  reason: string
}

export function correlateAll(
  calls: CallForCorrelation[],
  tickets: TicketForCorrelation[],
): CorrelationRowOut[] {
  return calls.map((c) => {
    const { ticketId, confidence, reason } = correlateCall(c, tickets)
    return { cdrId: c.cdrId, ticketId, confidence, reason }
  })
}

export async function runMonthlyCorrelation(month: string): Promise<{
  candidates: number
  matched: number
  exact: number
  fuzzy: number
}> {
  const { getPool } = await import('@/lib/db/client')
  const { upsertCorrelations } = await import('@/../job-runner/upsert')
  const pool = getPool()

  const callsRes = await pool.query(
    `SELECT cdr_id, normalized_phone, start_time
       FROM ai_candidate_calls
       WHERE month = $1`,
    [month],
  )
  const ticketsRes = await pool.query(
    `SELECT id, normalized_phone, date_entered
       FROM tickets
       WHERE month = $1
         AND merged_into_ticket_id IS NULL`,
    [month],
  )

  const calls: CallForCorrelation[] = callsRes.rows.map((r) => ({
    cdrId: r.cdr_id,
    normalizedPhone: r.normalized_phone,
    startTime: r.start_time,
  }))
  const tickets: TicketForCorrelation[] = ticketsRes.rows.map((r) => ({
    id: r.id,
    normalizedPhone: r.normalized_phone,
    dateEntered: r.date_entered,
  }))

  const rows = correlateAll(calls, tickets)
  await upsertCorrelations(rows, month)

  return {
    candidates: calls.length,
    matched: rows.filter((r) => r.ticketId !== null).length,
    exact: rows.filter((r) => r.confidence === 'exact').length,
    fuzzy: rows.filter((r) => r.confidence === 'fuzzy').length,
  }
}
```

> Note: the `@/../job-runner/upsert` import path mirrors how `pull.ts` already imports from `job-runner` modules. If tsconfig aliases differ, switch to a relative import.

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add lib/connectwise/runner.ts tests/connectwise/runner.test.ts job-runner/upsert.ts
git commit -m "feat(connectwise): correlation runner + upsertCorrelations"
```

---

### Task 7: Wire AI CDR fetch + correlation into the monthly pull

**Files:**
- Modify: `job-runner/pull.ts`

- [ ] **Step 1: Edit `runMonthlyPull` — insert AI CDR fetch between queue stats and ticket fetch, then run correlation after tickets**

Replace the `=== FETCH QUEUE STATS (0-10%) ===` through `=== SYNC INTO PART 1 TABLES ===` section with:

```typescript
// === FETCH QUEUE STATS (0-10%) ===
const queueIds = [ENGLISH_QUEUE_ID, FRENCH_QUEUE_ID, ...AI_OVERFLOW_QUEUE_IDS]
let queueStatsCount = 0

for (let i = 0; i < queueIds.length; i++) {
  const qid = queueIds[i]
  const pct = Math.round(((i + 1) / queueIds.length) * 10)
  await updateProgress(month, pct, `Fetching queue stats for ${qid}…`, totalDays)

  try {
    const stats = (await getQueueStats(qid, startDate, endDate)) as unknown as QueueStatsRow
    if (stats) {
      await upsertQueueStats(stats, qid, month)
      queueStatsCount++
    }
  } catch (err) {
    console.warn(`[pull] Queue stats failed for ${qid}:`, err)
  }
  await sleep(500)
}

// === FETCH AI-QUEUE CDRS (10-25%) ===
await updateProgress(month, 12, 'Fetching AI-queue CDRs…')
let aiCalls: Awaited<ReturnType<typeof getCdrsForUsers>> = []
try {
  aiCalls = await getCdrsForUsers(
    [...AI_OVERFLOW_QUEUE_IDS],
    startDate,
    endDate,
  )
  console.log(`[pull]   → ${aiCalls.length} AI-queue calls`)
  if (aiCalls.length > 0) {
    await updateProgress(month, 20, `Upserting ${aiCalls.length} AI candidate calls…`)
    await upsertAiCandidateCalls(aiCalls, month)
  }
} catch (err) {
  console.warn('[pull] AI CDR fetch failed (non-fatal):', err)
}

// === FETCH CONNECTWISE TICKETS (25-35%) ===
let tickets: Awaited<ReturnType<typeof fetchTickets>> = []
await updateProgress(month, 26, 'Fetching ConnectWise tickets…')
try {
  tickets = await fetchTickets(startDate, endDate)
  if (tickets.length > 0) {
    await updateProgress(month, 33, `Upserting ${tickets.length} tickets…`)
    await upsertTicketBatch(tickets, month)
  }
} catch (err) {
  console.warn('[pull] ConnectWise ticket fetch failed (non-fatal):', err)
}

// === RUN CORRELATION (35-45%) ===
await updateProgress(month, 36, 'Correlating AI calls to tickets…')
let correlationResult = { candidates: 0, matched: 0, exact: 0, fuzzy: 0 }
try {
  const { runMonthlyCorrelation } = await import('@/lib/connectwise/runner')
  correlationResult = await runMonthlyCorrelation(month)
  console.log(`[pull]   → correlated ${correlationResult.matched}/${correlationResult.candidates}`)
} catch (err) {
  console.warn('[pull] Correlation failed (non-fatal):', err)
}
```

Add imports at the top:

```typescript
import { getCdrsForUsers } from '@/lib/versature/cdrs-users'
import { upsertCDRBatch, upsertAiCandidateCalls, upsertQueueStats, upsertTicketBatch, upsertKPISnapshot, upsertBhKpiSnapshot, type QueueStatsRow } from './upsert'
```

And update `recordCounts`:

```typescript
const recordCounts = {
  cdrs: aiCalls.length,
  queueStats: queueStatsCount,
  tickets: tickets.length,
  correlations: correlationResult.matched,
}
```

- [ ] **Step 2: Run job-runner tests to verify no regression**

```
npx vitest run tests/job-runner/
```

- [ ] **Step 3: Commit**

```bash
git add job-runner/pull.ts
git commit -m "feat(pull): wire AI CDR fetch + monthly correlation into pull flow"
```

---

## Part B: KPIs 11–14

Each KPI follows the same shape: a `compute` function that reads from the DB and returns a JSON-serializable object. Each ships with tests mocking `@/lib/db/client`.

### Task 8: KPI 11 — Correlation Rate

Definition: `matched / candidates` across `ai_candidate_calls` for the period.

**Files:**
- Create: `lib/kpis/kpi-11-correlation-rate.ts`
- Test: `tests/kpis/kpi-11-correlation-rate.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// tests/kpis/kpi-11-correlation-rate.test.ts
import { describe, expect, test, vi } from 'vitest'

const queryMock = vi.fn()
vi.mock('@/lib/db/client', () => ({ getPool: () => ({ query: queryMock }) }))

describe('computeKpi11', () => {
  test('returns correlation rate and counts', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ candidates: '100', matched: '72', exact: '60', fuzzy: '12' }],
    })

    const { computeKpi11 } = await import('@/lib/kpis/kpi-11-correlation-rate')
    const r = await computeKpi11({
      start: new Date('2026-03-01T00:00:00Z'),
      end: new Date('2026-03-31T23:59:59Z'),
    })

    expect(r).toEqual({ candidates: 100, matched: 72, exact: 60, fuzzy: 12, rate: 0.72 })
  })

  test('rate is 0 when there are no candidates', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ candidates: '0', matched: '0', exact: '0', fuzzy: '0' }],
    })
    const { computeKpi11 } = await import('@/lib/kpis/kpi-11-correlation-rate')
    const r = await computeKpi11({ start: new Date(), end: new Date() })
    expect(r.rate).toBe(0)
  })
})
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```typescript
// lib/kpis/kpi-11-correlation-rate.ts
import { getPool } from '@/lib/db/client'

export async function computeKpi11(period: { start: Date; end: Date }) {
  const pool = getPool()
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int                                             AS candidates,
       COUNT(c.ticket_id)::int                                   AS matched,
       COUNT(*) FILTER (WHERE c.confidence = 'exact')::int       AS exact,
       COUNT(*) FILTER (WHERE c.confidence = 'fuzzy')::int       AS fuzzy
       FROM ai_candidate_calls a
  LEFT JOIN connectwise_correlations c
         ON c.cdr_id = a.cdr_id AND c.month = a.month
      WHERE a.start_time >= $1 AND a.start_time <= $2`,
    [period.start, period.end],
  )
  const r = rows[0] ?? { candidates: 0, matched: 0, exact: 0, fuzzy: 0 }
  const candidates = Number(r.candidates)
  const matched = Number(r.matched)
  return {
    candidates,
    matched,
    exact: Number(r.exact),
    fuzzy: Number(r.fuzzy),
    rate: candidates === 0 ? 0 : matched / candidates,
  }
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add lib/kpis/kpi-11-correlation-rate.ts tests/kpis/kpi-11-correlation-rate.test.ts
git commit -m "feat(kpi): #11 correlation rate"
```

---

### Task 9: KPI 12 — Uncorrelated Calls Breakdown

Definition: the count of AI calls with no ticket match, broken down by queue (to_user) + a sample list for the UI table.

**Files:**
- Create: `lib/kpis/kpi-12-unmatched-calls.ts`
- Test: `tests/kpis/kpi-12-unmatched-calls.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// tests/kpis/kpi-12-unmatched-calls.test.ts
import { describe, expect, test, vi } from 'vitest'

const queryMock = vi.fn()
vi.mock('@/lib/db/client', () => ({ getPool: () => ({ query: queryMock }) }))

describe('computeKpi12', () => {
  test('returns unmatched count + per-queue breakdown + sample rows', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          { to_user: '8030', unmatched: '8' },
          { to_user: '8031', unmatched: '3' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { cdr_id: 'a', from_number: '4165550100', start_time: new Date('2026-03-15T09:58Z'), to_user: '8030' },
        ],
      })

    const { computeKpi12 } = await import('@/lib/kpis/kpi-12-unmatched-calls')
    const r = await computeKpi12({ start: new Date('2026-03-01'), end: new Date('2026-03-31') })

    expect(r.totalUnmatched).toBe(11)
    expect(r.byQueue).toEqual([
      { queue: '8030', count: 8 },
      { queue: '8031', count: 3 },
    ])
    expect(r.sample).toHaveLength(1)
    expect(r.sample[0]).toMatchObject({ cdrId: 'a', fromNumber: '4165550100', queue: '8030' })
  })
})
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```typescript
// lib/kpis/kpi-12-unmatched-calls.ts
import { getPool } from '@/lib/db/client'

export interface UnmatchedSample {
  cdrId: string
  fromNumber: string | null
  startTime: string
  queue: string
}

export async function computeKpi12(period: { start: Date; end: Date }) {
  const pool = getPool()

  const breakdown = await pool.query(
    `SELECT a.to_user, COUNT(*)::int AS unmatched
       FROM ai_candidate_calls a
  LEFT JOIN connectwise_correlations c
         ON c.cdr_id = a.cdr_id AND c.month = a.month
      WHERE a.start_time >= $1 AND a.start_time <= $2
        AND c.ticket_id IS NULL
   GROUP BY a.to_user
   ORDER BY a.to_user`,
    [period.start, period.end],
  )

  const sample = await pool.query(
    `SELECT a.cdr_id, a.from_number, a.start_time, a.to_user
       FROM ai_candidate_calls a
  LEFT JOIN connectwise_correlations c
         ON c.cdr_id = a.cdr_id AND c.month = a.month
      WHERE a.start_time >= $1 AND a.start_time <= $2
        AND c.ticket_id IS NULL
   ORDER BY a.start_time DESC
      LIMIT 20`,
    [period.start, period.end],
  )

  const byQueue = breakdown.rows.map((r) => ({
    queue: String(r.to_user),
    count: Number(r.unmatched),
  }))
  const totalUnmatched = byQueue.reduce((s, r) => s + r.count, 0)

  return {
    totalUnmatched,
    byQueue,
    sample: sample.rows.map((r): UnmatchedSample => ({
      cdrId: r.cdr_id,
      fromNumber: r.from_number,
      startTime: r.start_time instanceof Date ? r.start_time.toISOString() : String(r.start_time),
      queue: String(r.to_user),
    })),
  }
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add lib/kpis/kpi-12-unmatched-calls.ts tests/kpis/kpi-12-unmatched-calls.test.ts
git commit -m "feat(kpi): #12 unmatched calls breakdown"
```

---

### Task 10: KPI 13 — SLA Compliance

Definition: of correlated tickets where `resolved_date_time IS NOT NULL`, what share have `sla_status = 'met'`. Also return a daily time-series so the UI can render a line chart.

Note: `sla_status` is not directly set by ConnectWise fetch yet. For this MVP, compute it inline: `met` if `resolved_date_time - date_entered <= 24h`, else `breached`. Unresolved tickets → excluded from the rate; counted separately.

**Files:**
- Create: `lib/kpis/kpi-13-sla-compliance.ts`
- Test: `tests/kpis/kpi-13-sla-compliance.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// tests/kpis/kpi-13-sla-compliance.test.ts
import { describe, expect, test, vi } from 'vitest'

const queryMock = vi.fn()
vi.mock('@/lib/db/client', () => ({ getPool: () => ({ query: queryMock }) }))

describe('computeKpi13', () => {
  test('returns overall + daily SLA compliance', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ resolved: '40', met: '32', open: '5' }] })
      .mockResolvedValueOnce({
        rows: [
          { day: '2026-03-01', resolved: '10', met: '9' },
          { day: '2026-03-02', resolved: '12', met: '8' },
        ],
      })

    const { computeKpi13 } = await import('@/lib/kpis/kpi-13-sla-compliance')
    const r = await computeKpi13({ start: new Date('2026-03-01'), end: new Date('2026-03-31') })

    expect(r.overall).toEqual({ resolved: 40, met: 32, open: 5, rate: 0.8 })
    expect(r.daily).toEqual([
      { date: '2026-03-01', resolved: 10, met: 9, rate: 0.9 },
      { date: '2026-03-02', resolved: 12, met: 8, rate: expect.closeTo(0.6667, 3) },
    ])
  })
})
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```typescript
// lib/kpis/kpi-13-sla-compliance.ts
import { getPool } from '@/lib/db/client'

const SLA_HOURS = 24

const METRICS_CTE = `
  WITH correlated_tickets AS (
    SELECT DISTINCT t.id, t.date_entered, t.resolved_date_time
      FROM connectwise_correlations cc
      JOIN tickets t ON t.id = cc.ticket_id AND t.month = cc.month
      JOIN ai_candidate_calls a
        ON a.cdr_id = cc.cdr_id AND a.month = cc.month
     WHERE a.start_time >= $1 AND a.start_time <= $2
  )
`

export async function computeKpi13(period: { start: Date; end: Date }) {
  const pool = getPool()

  const overall = await pool.query(
    `${METRICS_CTE}
     SELECT
       COUNT(*) FILTER (WHERE resolved_date_time IS NOT NULL)::int                          AS resolved,
       COUNT(*) FILTER (
         WHERE resolved_date_time IS NOT NULL
           AND resolved_date_time - date_entered <= interval '${SLA_HOURS} hours'
       )::int                                                                                AS met,
       COUNT(*) FILTER (WHERE resolved_date_time IS NULL)::int                              AS open
       FROM correlated_tickets`,
    [period.start, period.end],
  )

  const daily = await pool.query(
    `${METRICS_CTE}
     SELECT to_char(date_trunc('day', date_entered), 'YYYY-MM-DD') AS day,
            COUNT(*) FILTER (WHERE resolved_date_time IS NOT NULL)::int AS resolved,
            COUNT(*) FILTER (
              WHERE resolved_date_time IS NOT NULL
                AND resolved_date_time - date_entered <= interval '${SLA_HOURS} hours'
            )::int AS met
       FROM correlated_tickets
   GROUP BY 1
   ORDER BY 1`,
    [period.start, period.end],
  )

  const o = overall.rows[0] ?? { resolved: 0, met: 0, open: 0 }
  const resolved = Number(o.resolved)
  const met = Number(o.met)

  return {
    overall: {
      resolved,
      met,
      open: Number(o.open),
      rate: resolved === 0 ? 0 : met / resolved,
    },
    daily: daily.rows.map((r) => {
      const res = Number(r.resolved)
      const m = Number(r.met)
      return { date: r.day, resolved: res, met: m, rate: res === 0 ? 0 : m / res }
    }),
  }
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add lib/kpis/kpi-13-sla-compliance.ts tests/kpis/kpi-13-sla-compliance.test.ts
git commit -m "feat(kpi): #13 SLA compliance (overall + daily)"
```

---

### Task 11: KPI 14 — Resolution Time

Definition: for correlated resolved tickets in the period, return mean, median, and p90 of `resolved_date_time - date_entered` in minutes.

**Files:**
- Create: `lib/kpis/kpi-14-resolution-time.ts`
- Test: `tests/kpis/kpi-14-resolution-time.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// tests/kpis/kpi-14-resolution-time.test.ts
import { describe, expect, test, vi } from 'vitest'

const queryMock = vi.fn()
vi.mock('@/lib/db/client', () => ({ getPool: () => ({ query: queryMock }) }))

describe('computeKpi14', () => {
  test('returns mean / median / p90 in minutes', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ count: '50', mean_minutes: '45.5', median_minutes: '30', p90_minutes: '120' }],
    })
    const { computeKpi14 } = await import('@/lib/kpis/kpi-14-resolution-time')
    const r = await computeKpi14({ start: new Date('2026-03-01'), end: new Date('2026-03-31') })
    expect(r).toEqual({ count: 50, meanMinutes: 45.5, medianMinutes: 30, p90Minutes: 120 })
  })

  test('handles empty dataset', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ count: '0', mean_minutes: null, median_minutes: null, p90_minutes: null }],
    })
    const { computeKpi14 } = await import('@/lib/kpis/kpi-14-resolution-time')
    const r = await computeKpi14({ start: new Date(), end: new Date() })
    expect(r).toEqual({ count: 0, meanMinutes: 0, medianMinutes: 0, p90Minutes: 0 })
  })
})
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```typescript
// lib/kpis/kpi-14-resolution-time.ts
import { getPool } from '@/lib/db/client'

export async function computeKpi14(period: { start: Date; end: Date }) {
  const pool = getPool()
  const { rows } = await pool.query(
    `WITH correlated_resolved AS (
       SELECT DISTINCT t.id,
              extract(epoch FROM (t.resolved_date_time - t.date_entered)) / 60 AS minutes
         FROM connectwise_correlations cc
         JOIN tickets t ON t.id = cc.ticket_id AND t.month = cc.month
         JOIN ai_candidate_calls a
           ON a.cdr_id = cc.cdr_id AND a.month = cc.month
        WHERE a.start_time >= $1 AND a.start_time <= $2
          AND t.resolved_date_time IS NOT NULL
     )
     SELECT COUNT(*)::int                                                  AS count,
            AVG(minutes)                                                    AS mean_minutes,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes)            AS median_minutes,
            percentile_cont(0.9) WITHIN GROUP (ORDER BY minutes)            AS p90_minutes
       FROM correlated_resolved`,
    [period.start, period.end],
  )
  const r = rows[0] ?? {}
  return {
    count: Number(r.count ?? 0),
    meanMinutes: r.mean_minutes === null ? 0 : Number(r.mean_minutes),
    medianMinutes: r.median_minutes === null ? 0 : Number(r.median_minutes),
    p90Minutes: r.p90_minutes === null ? 0 : Number(r.p90_minutes),
  }
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add lib/kpis/kpi-14-resolution-time.ts tests/kpis/kpi-14-resolution-time.test.ts
git commit -m "feat(kpi): #14 resolution-time stats (mean/median/p90)"
```

---

### Task 12: Register KPIs 11–14 in `get-dashboard-data.ts`

**Files:**
- Modify: `lib/kpis/get-dashboard-data.ts`
- Modify: `tests/kpis/get-dashboard-data.test.ts`

- [ ] **Step 1: Update test expectations**

In `tests/kpis/get-dashboard-data.test.ts`, mock `kpi-11`..`kpi-14` modules (add them alongside existing mocks) and assert the returned object contains `kpi11..kpi14` keys. Pattern follows existing `vi.mock('@/lib/kpis/kpi-5-ai', ...)` calls — copy/paste and rename for each.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Replace `get-dashboard-data.ts`**

```typescript
import { computeKpi1 } from './kpi-1-total-incoming'
import { computeKpi2 } from './kpi-2-dropped'
import { computeKpi3 } from './kpi-3-english'
import { computeKpi4 } from './kpi-4-french'
import { computeKpi5 } from './kpi-5-ai'
import { computeKpi6 } from './kpi-6-pct-dropped'
import { computeKpi7 } from './kpi-7-language-split'
import { computeKpi8 } from './kpi-8-avg-length'
import { computeKpi9 } from './kpi-9-day-of-week'
import { computeKpi10 } from './kpi-10-hourly-length'
import { computeKpi11 } from './kpi-11-correlation-rate'
import { computeKpi12 } from './kpi-12-unmatched-calls'
import { computeKpi13 } from './kpi-13-sla-compliance'
import { computeKpi14 } from './kpi-14-resolution-time'
import { computeShortCalls } from './short-calls'

export async function getDashboardData(
  period: { start: Date; end: Date },
  options: { includeWeekends?: boolean } = {},
) {
  const [
    kpi1, kpi2, kpi3, kpi4, kpi5, kpi6, kpi7, kpi8, kpi9, kpi10,
    kpi11, kpi12, kpi13, kpi14,
    shortCalls,
  ] = await Promise.all([
    computeKpi1(period, options),
    computeKpi2(period, options),
    computeKpi3(period, options),
    computeKpi4(period, options),
    computeKpi5(period, options),
    computeKpi6(period, options),
    computeKpi7(period, options),
    computeKpi8(period, options),
    computeKpi9(period, options),
    computeKpi10(period, options),
    computeKpi11(period),
    computeKpi12(period),
    computeKpi13(period),
    computeKpi14(period),
    computeShortCalls(period, options),
  ])

  return {
    kpi1, kpi2, kpi3, kpi4, kpi5, kpi6, kpi7, kpi8, kpi9, kpi10,
    kpi11, kpi12, kpi13, kpi14,
    shortCalls,
  }
}
```

- [ ] **Step 4: Run full test suite**

```
npm test
```

- [ ] **Step 5: Commit**

```bash
git add lib/kpis/get-dashboard-data.ts tests/kpis/get-dashboard-data.test.ts
git commit -m "feat(kpis): register correlation KPIs 11-14 in dashboard aggregator"
```

---

## Part C: UI

### Task 13: `InfoButton` + reusable explanation popover

**Files:**
- Create: `app/components/InfoButton.tsx`
- Test: none (simple presentational component; covered implicitly by snapshot tests later)

- [ ] **Step 1: Implement**

```tsx
// app/components/InfoButton.tsx
'use client'
import { useState } from 'react'

export function InfoButton({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-label={`About ${title}`}
        onClick={() => setOpen((v) => !v)}
        className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-lime-800/60 text-xs text-lime-300 hover:bg-lime-900/40"
      >
        ⓘ
      </button>
      {open && (
        <span
          role="dialog"
          className="absolute left-0 top-7 z-10 w-72 rounded-xl border border-lime-800/60 bg-[#0a0a0a] p-3 text-xs text-lime-100 shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          <span className="block font-semibold text-lime-300">{title}</span>
          <span className="mt-1 block text-lime-200/80">{children}</span>
        </span>
      )}
    </span>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/InfoButton.tsx
git commit -m "feat(ui): InfoButton reusable explanation popover"
```

---

### Task 14: SLA compliance chart

**Files:**
- Create: `app/components/SlaComplianceChart.tsx`

- [ ] **Step 1: Implement (follows the pattern in `HourlyDurationChart`)**

```tsx
// app/components/SlaComplianceChart.tsx
'use client'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

export type SlaPoint = { date: string; rate: number; resolved: number; met: number }

export function SlaComplianceChart({ data }: { data: SlaPoint[] }) {
  const asPct = data.map((d) => ({ ...d, pct: Math.round(d.rate * 100) }))
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <LineChart data={asPct} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <XAxis dataKey="date" tick={{ fill: '#a3e635', fontSize: 11 }} />
          <YAxis domain={[0, 100]} tick={{ fill: '#a3e635', fontSize: 11 }} unit="%" />
          <Tooltip
            contentStyle={{ background: '#0a0a0a', border: '1px solid #365314' }}
            labelStyle={{ color: '#ecfccb' }}
          />
          <ReferenceLine y={80} stroke="#65a30d" strokeDasharray="3 3" />
          <Line type="monotone" dataKey="pct" stroke="#a3e635" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/SlaComplianceChart.tsx
git commit -m "feat(ui): SLA compliance line chart"
```

---

### Task 15: Uncorrelated calls table

**Files:**
- Create: `app/components/UncorrelatedCallsTable.tsx`

- [ ] **Step 1: Implement**

```tsx
// app/components/UncorrelatedCallsTable.tsx
import type { UnmatchedSample } from '@/lib/kpis/kpi-12-unmatched-calls'

export function UncorrelatedCallsTable({ rows }: { rows: UnmatchedSample[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-lime-300/60">No uncorrelated AI calls in this period.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-[0.15em] text-lime-400/70">
            <th className="py-2 pr-4">Time</th>
            <th className="py-2 pr-4">Caller</th>
            <th className="py-2 pr-4">Queue</th>
            <th className="py-2 pr-4">CDR ID</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.cdrId} className="border-t border-lime-800/30 text-lime-100">
              <td className="py-2 pr-4">{new Date(r.startTime).toLocaleString()}</td>
              <td className="py-2 pr-4">{r.fromNumber ?? '—'}</td>
              <td className="py-2 pr-4">{r.queue}</td>
              <td className="py-2 pr-4 font-mono text-xs text-lime-400/70">{r.cdrId}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/UncorrelatedCallsTable.tsx
git commit -m "feat(ui): uncorrelated calls sample table"
```

---

### Task 16: `VoiceAssistHealth` section assembling the pieces

**Files:**
- Create: `app/components/VoiceAssistHealth.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Implement the section**

```tsx
// app/components/VoiceAssistHealth.tsx
import { KpiCard } from './KpiCard'
import { InfoButton } from './InfoButton'
import { SlaComplianceChart } from './SlaComplianceChart'
import { UncorrelatedCallsTable } from './UncorrelatedCallsTable'

interface Kpi11 { candidates: number; matched: number; exact: number; fuzzy: number; rate: number }
interface Kpi12 { totalUnmatched: number; byQueue: { queue: string; count: number }[]; sample: Parameters<typeof UncorrelatedCallsTable>[0]['rows'] }
interface Kpi13 { overall: { resolved: number; met: number; open: number; rate: number }; daily: { date: string; resolved: number; met: number; rate: number }[] }
interface Kpi14 { count: number; meanMinutes: number; medianMinutes: number; p90Minutes: number }

export function VoiceAssistHealth({
  kpi11, kpi12, kpi13, kpi14,
}: { kpi11: Kpi11; kpi12: Kpi12; kpi13: Kpi13; kpi14: Kpi14 }) {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`
  const minutes = (n: number) => `${Math.round(n)}m`

  return (
    <section className="rounded-2xl border border-lime-800/40 bg-[#111411] p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-lime-300">AI Voice Assist Health</h2>
        <InfoButton title="What is this?">
          We match each AI-queue call to a ConnectWise ticket using caller phone and a time window.
          Match rate measures how often the AI produced a downstream ticket. SLA looks at resolution
          within 24h of ticket creation.
        </InfoButton>
      </div>

      <p className="mt-1 text-xs text-lime-400/60">
        Correlation is heuristic (phone + time window). Treat numbers as indicative, not exact.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Correlation Rate"
          value={pct(kpi11.rate)}
          helper={`${kpi11.matched} of ${kpi11.candidates} AI calls matched`}
        />
        <KpiCard
          label="Uncorrelated AI Calls"
          value={String(kpi12.totalUnmatched)}
          helper={kpi12.byQueue.map((q) => `${q.queue}: ${q.count}`).join(' · ')}
          tone={kpi12.totalUnmatched > 0 ? 'bad' : undefined}
        />
        <KpiCard
          label="SLA Compliance (24h)"
          value={pct(kpi13.overall.rate)}
          helper={`${kpi13.overall.met}/${kpi13.overall.resolved} met · ${kpi13.overall.open} open`}
          tone={kpi13.overall.rate < 0.8 ? 'bad' : undefined}
        />
        <KpiCard
          label="Median Resolution Time"
          value={minutes(kpi14.medianMinutes)}
          helper={`p90 ${minutes(kpi14.p90Minutes)} · n=${kpi14.count}`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-lime-200">SLA Compliance — Daily</h3>
            <InfoButton title="SLA compliance">
              Share of correlated tickets resolved within 24 hours of `dateEntered`.
              Dashed line = 80% target.
            </InfoButton>
          </div>
          <div className="mt-2 rounded-2xl border border-lime-800/30 bg-[#0a0a0a] p-3">
            <SlaComplianceChart data={kpi13.daily} />
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-lime-200">Uncorrelated AI Calls (recent 20)</h3>
            <InfoButton title="Why this list exists">
              Calls that hit an AI-overflow extension but had no matching ConnectWise ticket created
              within the time window. Review these to confirm whether they needed a ticket.
            </InfoButton>
          </div>
          <div className="mt-2 rounded-2xl border border-lime-800/30 bg-[#0a0a0a] p-3">
            <UncorrelatedCallsTable rows={kpi12.sample} />
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Wire into `app/page.tsx` — replace the placeholder section**

Replace:

```tsx
<section className="rounded-2xl border border-dashed border-lime-800/40 bg-[#111411] p-5">
  <h2 className="text-lg font-semibold text-lime-300">AI Voice Assist Health</h2>
  <p className="mt-2 text-sm text-lime-300/60">Reserved for Part 2 after Part 1 manual validation.</p>
</section>
```

with:

```tsx
<VoiceAssistHealth
  kpi11={data.kpi11}
  kpi12={data.kpi12}
  kpi13={data.kpi13}
  kpi14={data.kpi14}
/>
```

and add the import at the top:

```tsx
import { VoiceAssistHealth } from './components/VoiceAssistHealth'
```

- [ ] **Step 3: Update `tests/app/page.test.tsx` — add `kpi11`..`kpi14` to mock dashboard data**

Mirror the existing test fixture for KPI 5 (look up the pattern) and supply empty but shape-correct objects for the new KPIs.

- [ ] **Step 4: Run full test suite**

```
npm test
```

- [ ] **Step 5: Start dev server and manually verify rendering**

```
npm run dev
```

Navigate to `http://localhost:3000/?period=this-month`. Confirm the Voice Assist Health section renders with numbers from a pulled historical month (or all zeros for a fresh DB). Click each ⓘ button.

- [ ] **Step 6: Commit**

```bash
git add app/components/VoiceAssistHealth.tsx app/page.tsx tests/app/page.test.tsx
git commit -m "feat(ui): AI Voice Assist Health section with KPIs 11-14"
```

---

## Self-Review Checklist

- [ ] Every task's code block is complete (no `…`, `TODO`, or "add error handling here").
- [ ] All new KPI modules are registered in `get-dashboard-data.ts` (Task 12).
- [ ] Migration 005 creates every column referenced by later queries (`normalized_phone`, `resolved_date_time`, `sla_status`, `merged_into_ticket_id`, `status`, `closed_flag`, plus the two new tables).
- [ ] The pull wires `getCdrsForUsers`, `upsertAiCandidateCalls`, `runMonthlyCorrelation` in order.
- [ ] Type names used in tests match exports (`UnmatchedSample` from kpi-12, `CorrelationResult` from correlate, etc.).
- [ ] No `8030`/`8031` hardcoded — all references go through `AI_OVERFLOW_QUEUE_IDS`.
- [ ] Historical snapshot path in `app/page.tsx` still works because `kpi11..kpi14` will simply be absent from old snapshots; the UI handles this via TypeScript narrowing or we add a zero-default in the snapshot read path — flag this to handle during Task 16 testing.

## Open Follow-ups (Not in Scope for This Plan)

- Back-filling `kpi11..kpi14` into prior `monthly_kpi_snapshots`.
- Configurable SLA threshold (currently fixed at 24h).
- Adding an admin UI to manually confirm/override correlations.
