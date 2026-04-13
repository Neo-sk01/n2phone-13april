import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/kpis/kpi-1-total-incoming', () => ({
  computeKpi1: vi.fn().mockResolvedValue({ primaryCount: 50 }),
}))

vi.mock('@/lib/kpis/kpi-2-dropped', () => ({
  computeKpi2: vi.fn().mockResolvedValue({ totalDropped: 5 }),
}))

describe('computeKpi6', () => {
  test('derives percent dropped from KPI1 and KPI2', async () => {
    const { computeKpi6 } = await import('@/lib/kpis/kpi-6-pct-dropped')
    const result = await computeKpi6({
      start: new Date('2026-04-01T00:00:00Z'),
      end: new Date('2026-04-01T23:59:59Z'),
    })

    expect(result.rate).toBe(0.1)
  })
})
