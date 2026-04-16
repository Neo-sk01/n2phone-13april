import { describe, expect, test, vi, beforeEach } from 'vitest'
import { buildUpsertQueueStatsStatement } from '@/lib/db/queries'

describe('buildUpsertQueueStatsStatement', () => {
  test('targets queue_stats_daily by queue_id and stats_date', () => {
    const sql = buildUpsertQueueStatsStatement()
    expect(sql).toContain('insert into queue_stats_daily')
    expect(sql).toContain('on conflict (queue_id, stats_date)')
  })
})

describe('getAverageTalkTimes (KPI 8 SQL shape)', () => {
  const queryMock = vi.fn()

  beforeEach(() => {
    queryMock.mockReset()
    vi.resetModules()
    vi.doMock('@/lib/db/client', () => ({ getPool: () => ({ query: queryMock }) }))
  })

  test('computes a volume-weighted mean (sum(talk*offered)/sum(offered))', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })
    const { getAverageTalkTimes } = await import('@/lib/db/queries')
    await getAverageTalkTimes({
      start: new Date('2026-04-01T00:00:00Z'),
      end: new Date('2026-04-30T23:59:59Z'),
    })

    const sql: string = queryMock.mock.calls[0][0]
    // Must reference calls_offered — the weighting column — and must NOT be a
    // bare average-of-averages.
    expect(sql).toMatch(/sum\(\s*average_talk_time[^)]*\*\s*calls_offered/i)
    expect(sql).toMatch(/sum\(\s*calls_offered\s*\)/i)
    expect(sql).not.toMatch(/\bavg\s*\(\s*average_talk_time\s*\)/i)
  })
})

describe('getShortAnsweredCallCount (short-calls SQL shape)', () => {
  const queryMock = vi.fn()

  beforeEach(() => {
    queryMock.mockReset()
    vi.resetModules()
    vi.doMock('@/lib/db/client', () => ({ getPool: () => ({ query: queryMock }) }))
  })

  test('counts from logical_calls, not cdr_segments', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ count: 0 }] })
    const { getShortAnsweredCallCount } = await import('@/lib/db/queries')
    await getShortAnsweredCallCount(
      { start: new Date('2026-04-01T00:00:00Z'), end: new Date('2026-04-30T23:59:59Z') },
      10,
    )

    const sql: string = queryMock.mock.calls[0][0]
    // A transferred call produces multiple cdr_segments rows. Counting segments
    // inflates the short-call count; logical_calls is already de-duplicated.
    expect(sql).toMatch(/\bfrom\s+logical_calls\b/i)
    expect(sql).not.toMatch(/\bfrom\s+cdr_segments\b/i)
    // logical_calls uses `dnis` and `answered` columns, not `to_id`/`answer_time`.
    expect(sql).toMatch(/\bdnis\s*=\s*any/i)
    expect(sql).toMatch(/\banswered\s*=\s*true\b/i)
  })
})

describe('getAverageAnsweredDurationByHour (KPI 10 SQL shape)', () => {
  const queryMock = vi.fn()

  beforeEach(() => {
    queryMock.mockReset()
    vi.resetModules()
    vi.doMock('@/lib/db/client', () => ({ getPool: () => ({ query: queryMock }) }))
  })

  test('averages from logical_calls, not cdr_segments', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })
    const { getAverageAnsweredDurationByHour } = await import('@/lib/db/queries')
    await getAverageAnsweredDurationByHour({
      start: new Date('2026-04-01T00:00:00Z'),
      end: new Date('2026-04-30T23:59:59Z'),
    })

    const sql: string = queryMock.mock.calls[0][0]
    expect(sql).toMatch(/\bfrom\s+logical_calls\b/i)
    expect(sql).not.toMatch(/\bfrom\s+cdr_segments\b/i)
    expect(sql).toMatch(/\bdnis\s*=\s*any/i)
    expect(sql).toMatch(/\banswered\s*=\s*true\b/i)
  })
})
