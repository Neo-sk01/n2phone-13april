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
  })
})
