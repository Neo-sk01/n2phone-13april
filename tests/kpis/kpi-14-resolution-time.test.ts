import { describe, expect, test, vi, beforeEach } from 'vitest'

const queryMock = vi.fn()
vi.mock('@/lib/db/client', () => ({ getPool: () => ({ query: queryMock }) }))

describe('computeKpi14', () => {
  beforeEach(() => {
    queryMock.mockReset()
    vi.resetModules()
  })

  test('returns mean / median / p90 in minutes', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { count: '50', mean_minutes: '45.5', median_minutes: '30', p90_minutes: '120' },
      ],
    })
    const { computeKpi14 } = await import('@/lib/kpis/kpi-14-resolution-time')
    const r = await computeKpi14({
      start: new Date('2026-03-01'),
      end: new Date('2026-03-31'),
    })
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
