import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/db/queries', () => ({
  getAverageAnsweredDurationByHour: vi.fn().mockResolvedValue([
    { hour: 8, average_seconds: 120 },
    { hour: 9, average_seconds: 180 },
  ]),
}))

describe('computeKpi10', () => {
  test('returns average answered duration grouped by hour', async () => {
    const { computeKpi10 } = await import('@/lib/kpis/kpi-10-hourly-length')
    const result = await computeKpi10({
      start: new Date('2026-04-01T00:00:00Z'),
      end: new Date('2026-04-30T23:59:59Z'),
    })

    expect(result.series[0]).toEqual({ hour: 8, average_seconds: 120 })
  })
})
