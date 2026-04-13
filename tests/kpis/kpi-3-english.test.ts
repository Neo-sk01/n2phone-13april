import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/db/queries', () => ({
  getCallsOfferedForQueues: vi.fn().mockResolvedValue(50),
}))

describe('computeKpi3', () => {
  test('returns English queue offered volume', async () => {
    const { computeKpi3 } = await import('@/lib/kpis/kpi-3-english')
    expect(
      await computeKpi3({ start: new Date('2026-04-01T00:00:00Z'), end: new Date('2026-04-01T23:59:59Z') }),
    ).toEqual({ totalEnglish: 50 })
  })
})
