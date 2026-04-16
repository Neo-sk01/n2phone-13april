import { describe, expect, test, vi, beforeEach } from 'vitest'

const queryMock = vi.fn()
vi.mock('@/lib/db/client', () => ({ getPool: () => ({ query: queryMock }) }))

describe('computeKpi13', () => {
  beforeEach(() => {
    queryMock.mockReset()
    vi.resetModules()
  })

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
    const r = await computeKpi13({
      start: new Date('2026-03-01'),
      end: new Date('2026-03-31'),
    })

    expect(r.overall).toEqual({ resolved: 40, met: 32, open: 5, rate: 0.8 })
    expect(r.daily).toEqual([
      { date: '2026-03-01', resolved: 10, met: 9, rate: 0.9 },
      { date: '2026-03-02', resolved: 12, met: 8, rate: expect.closeTo(0.6667, 3) },
    ])
  })

  test('handles empty dataset', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ resolved: '0', met: '0', open: '0' }] })
      .mockResolvedValueOnce({ rows: [] })

    const { computeKpi13 } = await import('@/lib/kpis/kpi-13-sla-compliance')
    const r = await computeKpi13({ start: new Date(), end: new Date() })
    expect(r.overall.rate).toBe(0)
    expect(r.daily).toEqual([])
  })
})
