import { describe, expect, test, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const dashboardDataMock = vi.fn()
const detectHistoricalMonthMock = vi.fn()
const readKPISnapshotWithHealthMock = vi.fn()

vi.mock('@/lib/kpis/get-dashboard-data', () => ({
  getDashboardData: (...args: unknown[]) => dashboardDataMock(...args),
}))

vi.mock('@/lib/db/queries', () => ({
  getLastSuccessfulIngestAt: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/db/historical', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/db/historical')>('@/lib/db/historical')
  return {
    ...actual,
    detectHistoricalMonth: (...args: unknown[]) => detectHistoricalMonthMock(...args),
    readKPISnapshotWithHealth: (...args: unknown[]) => readKPISnapshotWithHealthMock(...args),
  }
})

const HEALTHY_DATA = {
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
  kpi13: { overall: { resolved: 10, met: 8, open: 2, rate: 0.8 }, daily: [] },
  kpi14: { count: 10, meanMinutes: 45, medianMinutes: 30, p90Minutes: 120 },
  shortCalls: { totalShortCalls: 1, thresholdSeconds: 10 },
}

describe('dashboard page', () => {
  beforeEach(() => {
    dashboardDataMock.mockReset()
    detectHistoricalMonthMock.mockReset()
    readKPISnapshotWithHealthMock.mockReset()
    vi.resetModules()
  })

  test('renders the KPI and chart section headings when AI-health is complete', async () => {
    dashboardDataMock.mockResolvedValueOnce(HEALTHY_DATA)
    detectHistoricalMonthMock.mockResolvedValueOnce(null)

    const Page = (await import('@/app/page')).default
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))

    expect(html).toContain('CSH Dashboard')
    expect(html).toContain('Total Incoming Calls')
    expect(html).toContain('AI Voice Assist Health')
    expect(html).toContain('Correlation Rate')
    expect(html).toContain('75.0%')
    expect(html).toContain('Median Resolution Time')
    expect(html).not.toContain('Data unavailable')
  })

  test('renders an explicit unavailable state when AI-health KPIs are missing', async () => {
    // Simulates a degraded historical snapshot: kpi11..14 stripped by pull.ts
    // when any AI-health stage failed during the monthly pull.
    const degradedData = {
      ...HEALTHY_DATA,
      kpi11: undefined,
      kpi12: undefined,
      kpi13: undefined,
      kpi14: undefined,
      aiHealthStatus: 'degraded',
    }
    dashboardDataMock.mockResolvedValueOnce(degradedData)
    detectHistoricalMonthMock.mockResolvedValueOnce(null)

    const Page = (await import('@/app/page')).default
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))

    expect(html).toContain('Total Incoming Calls')
    expect(html).toContain('AI Voice Assist Health')
    expect(html).toContain('Data unavailable')
    expect(html).toContain('AI-health data is unavailable for this period.')
    expect(html).not.toContain('75.0%')
  })

  test('renders unknown state when aiHealthStatus is explicitly unknown (legacy snapshot)', async () => {
    const unknownData = {
      ...HEALTHY_DATA,
      kpi11: undefined,
      kpi12: undefined,
      kpi13: undefined,
      kpi14: undefined,
      aiHealthStatus: 'unknown',
    }
    dashboardDataMock.mockResolvedValueOnce(unknownData)
    detectHistoricalMonthMock.mockResolvedValueOnce(null)

    const Page = (await import('@/app/page')).default
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))

    expect(html).toContain('AI-health data was not tracked for this period.')
  })

  test('?month= param loads a past month via readKPISnapshotWithHealth', async () => {
    // Past-month URL selection must bypass detectHistoricalMonth and go
    // straight to the joined snapshot+pull_log read, so operators can reach
    // the historical view without relying on the current period mapping.
    const fixedPastMonth = '2020-03' // definitely past regardless of wall clock
    readKPISnapshotWithHealthMock.mockResolvedValueOnce({
      kpis: HEALTHY_DATA,
      aiHealthStatus: 'complete',
    })

    const Page = (await import('@/app/page')).default
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ month: fixedPastMonth }) }),
    )

    expect(readKPISnapshotWithHealthMock).toHaveBeenCalledWith(fixedPastMonth)
    expect(dashboardDataMock).not.toHaveBeenCalled()
    // Header shows the month label rather than the period toggle's label.
    expect(html).toContain('March 2020')
    expect(html).toContain('Correlation Rate')
  })

  test('legacy snapshot (kpi11..14 present, no embedded status) trusts pull_log=unknown', async () => {
    // This is the exact regression Codex flagged: pre-4e499ab snapshots have
    // kpi11..14 but no aiHealthStatus in the JSON. The DB column says
    // 'unknown', and the UI must treat it as untrusted.
    const legacyKpis = { ...HEALTHY_DATA } as Record<string, unknown>
    delete legacyKpis.aiHealthStatus // legacy JSON has no status
    readKPISnapshotWithHealthMock.mockResolvedValueOnce({
      kpis: legacyKpis,
      aiHealthStatus: 'unknown',
    })

    const Page = (await import('@/app/page')).default
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ month: '2025-11' }) }),
    )

    // Must render the unavailable/unknown state even though kpi11..14 exist.
    expect(html).toContain('AI-health data was not tracked for this period.')
    expect(html).not.toContain('75.0%') // healthy numbers from fixture must be suppressed
  })
})
