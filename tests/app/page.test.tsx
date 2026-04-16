import { describe, expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/lib/kpis/get-dashboard-data', () => ({
  getDashboardData: vi.fn().mockResolvedValue({
    kpi1: { primaryCount: 25, queueCount: 24, deltaPct: 4, warning: null },
    kpi2: { totalDropped: 5 },
    kpi3: { totalEnglish: 10 },
    kpi4: { totalFrench: 5 },
    kpi5: { totalAi: 10 },
    kpi6: { rate: 0.2 },
    kpi7: { englishPct: 0.4, frenchPct: 0.2, aiPct: 0.2, unroutedPct: 0.2 },
    kpi8: { rows: [] },
    kpi9: { series: [] },
    kpi10: { series: [] },
    kpi11: { candidates: 20, matched: 15, exact: 12, fuzzy: 3, rate: 0.75 },
    kpi12: { totalUnmatched: 5, byQueue: [{ queue: '8030', count: 5 }], sample: [] },
    kpi13: {
      overall: { resolved: 10, met: 8, open: 2, rate: 0.8 },
      daily: [],
    },
    kpi14: { count: 10, meanMinutes: 45, medianMinutes: 30, p90Minutes: 120 },
    shortCalls: { totalShortCalls: 1, thresholdSeconds: 10 },
  }),
}))

vi.mock('@/lib/db/queries', () => ({
  getLastSuccessfulIngestAt: vi.fn().mockResolvedValue(null),
}))

describe('dashboard page', () => {
  test('renders the KPI and chart section headings', async () => {
    const Page = (await import('@/app/page')).default
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))

    expect(html).toContain('CSH Dashboard')
    expect(html).toContain('Total Incoming Calls')
    expect(html).toContain('AI Voice Assist Health')
    expect(html).toContain('Correlation Rate')
    expect(html).toContain('75.0%')
    expect(html).toContain('Median Resolution Time')
  })
})
