import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/db/queries', () => ({
  getAverageTalkTimes: vi.fn().mockResolvedValue([
    { queue_id: '8020', average_seconds: 180 },
    { queue_id: '8021', average_seconds: 210 },
  ]),
}))

describe('computeKpi8', () => {
  test('returns average talk time rows by queue', async () => {
    const { computeKpi8 } = await import('@/lib/kpis/kpi-8-avg-length')
    const result = await computeKpi8({
      start: new Date('2026-04-01T00:00:00Z'),
      end: new Date('2026-04-30T23:59:59Z'),
    })

    expect(result.rows).toHaveLength(2)
  })
})
