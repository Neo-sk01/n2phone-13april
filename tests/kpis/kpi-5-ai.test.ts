import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/db/queries', () => ({
  getCallsOfferedForQueues: vi.fn().mockResolvedValue(18),
}))

describe('computeKpi5', () => {
  test('returns the combined AI overflow queue volume', async () => {
    const { computeKpi5 } = await import('@/lib/kpis/kpi-5-ai')
    expect(
      await computeKpi5({ start: new Date('2026-04-01T00:00:00Z'), end: new Date('2026-04-01T23:59:59Z') }),
    ).toEqual({ totalAi: 18 })
  })
})
