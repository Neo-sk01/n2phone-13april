import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/kpis/kpi-1-total-incoming', () => ({
  computeKpi1: vi.fn().mockResolvedValue({ primaryCount: 100 }),
}))
vi.mock('@/lib/kpis/kpi-3-english', () => ({
  computeKpi3: vi.fn().mockResolvedValue({ totalEnglish: 50 }),
}))
vi.mock('@/lib/kpis/kpi-4-french', () => ({
  computeKpi4: vi.fn().mockResolvedValue({ totalFrench: 20 }),
}))
vi.mock('@/lib/kpis/kpi-5-ai', () => ({
  computeKpi5: vi.fn().mockResolvedValue({ totalAi: 10 }),
}))

describe('computeKpi7', () => {
  test('returns split percentages plus unrouted residual', async () => {
    const { computeKpi7 } = await import('@/lib/kpis/kpi-7-language-split')
    const result = await computeKpi7({
      start: new Date('2026-04-01T00:00:00Z'),
      end: new Date('2026-04-01T23:59:59Z'),
    })

    expect(result.unroutedPct).toBeCloseTo(0.2)
  })
})
