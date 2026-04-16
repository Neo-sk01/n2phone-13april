import { describe, expect, test, vi, beforeEach } from 'vitest'

const queryMock = vi.fn()
vi.mock('@/lib/db/client', () => ({ getPool: () => ({ query: queryMock }) }))

describe('computeKpi11', () => {
  beforeEach(() => {
    queryMock.mockReset()
    vi.resetModules()
  })

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
