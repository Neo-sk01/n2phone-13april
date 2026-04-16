import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/kpis/kpi-1-total-incoming', () => ({
  computeKpi1: vi.fn().mockResolvedValue({ primaryCount: 25, queueCount: 24, deltaPct: 4, warning: 'warn' }),
}))
vi.mock('@/lib/kpis/kpi-2-dropped', () => ({
  computeKpi2: vi.fn().mockResolvedValue({ totalDropped: 5 }),
}))
vi.mock('@/lib/kpis/kpi-3-english', () => ({
  computeKpi3: vi.fn().mockResolvedValue({ totalEnglish: 10 }),
}))
vi.mock('@/lib/kpis/kpi-4-french', () => ({
  computeKpi4: vi.fn().mockResolvedValue({ totalFrench: 8 }),
}))
vi.mock('@/lib/kpis/kpi-5-ai', () => ({
  computeKpi5: vi.fn().mockResolvedValue({ totalAi: 3 }),
}))
vi.mock('@/lib/kpis/kpi-6-pct-dropped', () => ({
  computeKpi6: vi.fn().mockResolvedValue({ rate: 0.05 }),
}))
vi.mock('@/lib/kpis/kpi-7-language-split', () => ({
  computeKpi7: vi.fn().mockResolvedValue({ englishPct: 50, frenchPct: 30, aiPct: 15, unroutedPct: 5 }),
}))
vi.mock('@/lib/kpis/kpi-8-avg-length', () => ({
  computeKpi8: vi.fn().mockResolvedValue({ rows: [] }),
}))
vi.mock('@/lib/kpis/kpi-9-day-of-week', () => ({
  computeKpi9: vi.fn().mockResolvedValue({ series: [] }),
}))
vi.mock('@/lib/kpis/kpi-10-hourly-length', () => ({
  computeKpi10: vi.fn().mockResolvedValue({ series: [] }),
}))
vi.mock('@/lib/kpis/short-calls', () => ({
  computeShortCalls: vi.fn().mockResolvedValue({ totalShortCalls: 1, thresholdSeconds: 10 }),
}))

describe('getDashboardData', () => {
  test('returns a normalized dashboard payload', async () => {
    const { getDashboardData } = await import('@/lib/kpis/get-dashboard-data')
    const data = await getDashboardData({
      start: new Date('2026-04-01T00:00:00Z'),
      end: new Date('2026-04-01T23:59:59Z'),
    })

    expect(data.kpi1.primaryCount).toBe(25)
    expect(data.kpi3.totalEnglish).toBe(10)
    expect(data.shortCalls.totalShortCalls).toBe(1)
  })
})
