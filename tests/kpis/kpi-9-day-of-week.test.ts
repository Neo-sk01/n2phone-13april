import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/db/queries', () => ({
  getWeekdaySplitRowsForPeriod: vi.fn().mockResolvedValue([
    { weekday: 'Mon', volume: 60 },
    { weekday: 'Mon', volume: 80 },
    { weekday: 'Tue', volume: 50 },
    { weekday: 'Tue', volume: 70 },
  ]),
}))

describe('computeKpi9', () => {
  test('averages each weekday across its occurrences in the month', async () => {
    const { computeKpi9 } = await import('@/lib/kpis/kpi-9-day-of-week')
    const result = await computeKpi9({
      start: new Date('2026-04-01T00:00:00Z'),
      end: new Date('2026-04-30T23:59:59Z'),
    })

    expect(result.series).toEqual([
      { day: 'Mon', average: 70 },
      { day: 'Tue', average: 60 },
    ])
  })
})
