import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/db/queries', () => ({
  getCallsOfferedForQueues: vi.fn().mockResolvedValue(12),
}))

describe('computeKpi4', () => {
  test('returns French queue offered volume', async () => {
    const { computeKpi4 } = await import('@/lib/kpis/kpi-4-french')
    expect(
      await computeKpi4({ start: new Date('2026-04-01T00:00:00Z'), end: new Date('2026-04-01T23:59:59Z') }),
    ).toEqual({ totalFrench: 12 })
  })
})
