import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/kpis/kpi-1-total-incoming', () => ({
  computeKpi1: vi.fn().mockResolvedValue({ primaryCount: 25, queueCount: 24, deltaPct: 4, warning: 'warn' }),
}))
vi.mock('@/lib/kpis/kpi-2-dropped', () => ({
  computeKpi2: vi.fn().mockResolvedValue({ totalDropped: 5 }),
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
    expect(data.shortCalls.totalShortCalls).toBe(1)
  })
})
