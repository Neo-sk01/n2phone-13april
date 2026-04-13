import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/db/queries', () => ({
  getAbandonedCallsForQueues: vi.fn().mockResolvedValue(5),
}))

describe('computeKpi2', () => {
  test('uses abandoned_calls from queue stats', async () => {
    const { computeKpi2 } = await import('@/lib/kpis/kpi-2-dropped')
    expect(
      await computeKpi2({ start: new Date('2026-04-01T00:00:00Z'), end: new Date('2026-04-01T23:59:59Z') }),
    ).toEqual({ totalDropped: 5 })
  })
})
