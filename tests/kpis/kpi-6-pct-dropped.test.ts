import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/kpis/kpi-1-total-incoming', () => ({
  computeKpi1: vi.fn().mockResolvedValue({ primaryCount: 48, queueCount: 50 }),
}))

vi.mock('@/lib/kpis/kpi-2-dropped', () => ({
  computeKpi2: vi.fn().mockResolvedValue({ totalDropped: 5 }),
}))

describe('computeKpi6', () => {
  test('derives percent dropped using the same source (queue_stats) on both sides', async () => {
    const { computeKpi6 } = await import('@/lib/kpis/kpi-6-pct-dropped')
    const result = await computeKpi6({
      start: new Date('2026-04-01T00:00:00Z'),
      end: new Date('2026-04-01T23:59:59Z'),
    })

    // 5 abandoned / 50 offered = 0.10, NOT 5 / 48 logical calls = 0.1042.
    expect(result.rate).toBe(0.1)
    expect(result.total).toBe(50)
    expect(result.dropped).toBe(5)
  })

  test('returns 0 when the queue count is zero (avoids divide-by-zero)', async () => {
    vi.doMock('@/lib/kpis/kpi-1-total-incoming', () => ({
      computeKpi1: vi.fn().mockResolvedValue({ primaryCount: 0, queueCount: 0 }),
    }))
    vi.resetModules()
    const { computeKpi6 } = await import('@/lib/kpis/kpi-6-pct-dropped')
    const r = await computeKpi6({ start: new Date(), end: new Date() })
    expect(r.rate).toBe(0)
  })
})
