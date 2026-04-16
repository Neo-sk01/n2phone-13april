import { describe, expect, test, vi, beforeEach } from 'vitest'

vi.mock('@/lib/kpis/kpi-1-total-incoming', () => ({
  computeKpi1: vi.fn().mockResolvedValue({ primaryCount: 98, queueCount: 100 }),
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
  beforeEach(() => {
    vi.resetModules()
  })

  test('uses queueCount (not primaryCount) as the shared denominator', async () => {
    const { computeKpi7 } = await import('@/lib/kpis/kpi-7-language-split')
    const result = await computeKpi7({
      start: new Date('2026-04-01T00:00:00Z'),
      end: new Date('2026-04-01T23:59:59Z'),
    })

    // 50/100, 20/100, 10/100, rest to unrouted. Any mixing with primaryCount (98)
    // would produce values like 0.5102 (50/98) instead of exactly 0.5.
    expect(result.englishPct).toBe(0.5)
    expect(result.frenchPct).toBe(0.2)
    expect(result.aiPct).toBe(0.1)
    expect(result.unroutedPct).toBeCloseTo(0.2, 10)
  })

  test('returns all zeros when queueCount is zero (no fake ||1 divisor)', async () => {
    vi.doMock('@/lib/kpis/kpi-1-total-incoming', () => ({
      computeKpi1: vi.fn().mockResolvedValue({ primaryCount: 0, queueCount: 0 }),
    }))
    vi.doMock('@/lib/kpis/kpi-3-english', () => ({
      computeKpi3: vi.fn().mockResolvedValue({ totalEnglish: 0 }),
    }))
    vi.doMock('@/lib/kpis/kpi-4-french', () => ({
      computeKpi4: vi.fn().mockResolvedValue({ totalFrench: 0 }),
    }))
    vi.doMock('@/lib/kpis/kpi-5-ai', () => ({
      computeKpi5: vi.fn().mockResolvedValue({ totalAi: 0 }),
    }))

    const { computeKpi7 } = await import('@/lib/kpis/kpi-7-language-split')
    const result = await computeKpi7({ start: new Date(), end: new Date() })
    expect(result).toEqual({
      englishPct: 0,
      frenchPct: 0,
      aiPct: 0,
      unroutedPct: 0,
    })
  })
})
