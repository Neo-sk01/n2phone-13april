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
