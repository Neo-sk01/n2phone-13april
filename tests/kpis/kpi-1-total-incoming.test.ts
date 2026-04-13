import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/db/queries', () => ({
  getLogicalCallCountForPeriod: vi.fn().mockResolvedValue(25),
  getCallsOfferedForQueues: vi.fn().mockResolvedValue(24),
}))

describe('computeKpi1', () => {
  test('returns both methods and the delta percentage', async () => {
    const { computeKpi1 } = await import('@/lib/kpis/kpi-1-total-incoming')

    const result = await computeKpi1({
      start: new Date('2026-04-01T00:00:00Z'),
      end: new Date('2026-04-01T23:59:59Z'),
    })

    expect(result.primaryCount).toBe(25)
    expect(result.queueCount).toBe(24)
    expect(result.deltaPct).toBeCloseTo(4, 0)
    expect(result.warning).toMatch(/more than 2%/)
  })
})
