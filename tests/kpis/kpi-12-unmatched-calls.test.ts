import { describe, expect, test, vi, beforeEach } from 'vitest'

const queryMock = vi.fn()
vi.mock('@/lib/db/client', () => ({ getPool: () => ({ query: queryMock }) }))

describe('computeKpi12', () => {
  beforeEach(() => {
    queryMock.mockReset()
    vi.resetModules()
  })

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
          {
            cdr_id: 'a',
            from_number: '4165550100',
            start_time: new Date('2026-03-15T09:58:00Z'),
            to_user: '8030',
          },
        ],
      })

    const { computeKpi12 } = await import('@/lib/kpis/kpi-12-unmatched-calls')
    const r = await computeKpi12({
      start: new Date('2026-03-01'),
      end: new Date('2026-03-31'),
    })

    expect(r.totalUnmatched).toBe(11)
    expect(r.byQueue).toEqual([
      { queue: '8030', count: 8 },
      { queue: '8031', count: 3 },
    ])
    expect(r.sample).toHaveLength(1)
    expect(r.sample[0]).toMatchObject({
      cdrId: 'a',
      fromNumber: '4165550100',
      queue: '8030',
    })
  })
})
