import { KpiCard } from './components/KpiCard'
import { PeriodToggle } from './components/PeriodToggle'
import { PullDataButton } from './components/PullDataButton'
import { getDashboardData } from '@/lib/kpis/get-dashboard-data'
import { getLastSuccessfulIngestAt } from '@/lib/db/queries'
import { detectHistoricalMonth, readKPISnapshot } from '@/lib/db/historical'
import { getPeriodRange } from '@/lib/utils/dates'
import { formatDuration } from '@/lib/utils/format'
import Link from 'next/link'
import dynamic from 'next/dynamic'

const LanguageSplitChart = dynamic(() => import('./components/LanguageSplitChart').then(m => ({ default: m.LanguageSplitChart })), { ssr: false })
const HourlyDurationChart = dynamic(() => import('./components/HourlyDurationChart').then(m => ({ default: m.HourlyDurationChart })), { ssr: false })
const DayOfWeekChart = dynamic(() => import('./components/DayOfWeekChart').then(m => ({ default: m.DayOfWeekChart })), { ssr: false })

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const period = params.period === 'this-week' || params.period === 'this-month' ? params.period : 'today'
  const includeWeekends = params.includeWeekends === 'true'
  const range = getPeriodRange(period)

  // Check for historical snapshot first
  let data: Awaited<ReturnType<typeof getDashboardData>> & { dataSource?: string }
  let isHistorical = false
  try {
    const historicalMonth = await detectHistoricalMonth(
      range.start.toISOString().slice(0, 19),
      range.end.toISOString().slice(0, 19),
    )
    if (historicalMonth) {
      const snapshot = await readKPISnapshot(historicalMonth)
      if (snapshot) {
        data = snapshot as typeof data
        isHistorical = true
      } else {
        data = await getDashboardData(range, { includeWeekends })
      }
    } else {
      data = await getDashboardData(range, { includeWeekends })
    }
  } catch {
    data = await getDashboardData(range, { includeWeekends })
  }

  const lastRefreshed = await getLastSuccessfulIngestAt()

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">CSH Dashboard</h1>
          <p className="mt-2 text-sm text-slate-600">Period: {range.label}</p>
          {isHistorical ? (
            <p className="mt-1 inline-block rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
              Showing historical data for {range.label}
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">
              Last refreshed: {lastRefreshed ?? 'No completed sync yet'}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PeriodToggle current={period} includeWeekends={includeWeekends} />
          <Link
            href={`/?period=${period}${includeWeekends ? '' : '&includeWeekends=true'}`}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600"
          >
            {includeWeekends ? 'Exclude Weekends' : 'Include Weekends'}
          </Link>
          <PullDataButton />
          <form action="/api/refresh" method="post">
            <input type="hidden" name="startDate" value={range.start.toISOString().slice(0, 10)} />
            <input type="hidden" name="endDate" value={range.end.toISOString().slice(0, 10)} />
            <button className="rounded-full bg-slate-900 px-4 py-2 text-sm text-white" type="submit">
              Refresh
            </button>
          </form>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Total Incoming Calls" value={String(data.kpi1.primaryCount)} helper={data.kpi1.warning ?? 'DNIS logical-call count'} />
        <KpiCard label="Total Dropped Calls" value={String(data.kpi2.totalDropped)} tone="bad" />
        <KpiCard label="English Incoming" value={String(data.kpi3.totalEnglish)} />
        <KpiCard label="French Incoming" value={String(data.kpi4.totalFrench)} />
        <KpiCard label="AI / Overflow Calls" value={String(data.kpi5.totalAi)} />
        <KpiCard label="% Dropped" value={`${(data.kpi6.rate * 100).toFixed(1)}%`} tone="bad" />
        <KpiCard label="Short Calls (&lt;10s)" value={String(data.shortCalls.totalShortCalls)} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Avg Call Length by Queue</h2>
            <p className="mt-1 text-sm text-slate-600">Queue-stats talk time, shown separately to keep all four queues readable.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.kpi8.rows.map((row: { queue_id: string; average_seconds: number }) => (
            <div key={row.queue_id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{row.queue_id}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {formatDuration(row.average_seconds)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Language Split</h2>
          <LanguageSplitChart
            data={[
              { name: 'English', value: data.kpi7.englishPct },
              { name: 'French', value: data.kpi7.frenchPct },
              { name: 'AI', value: data.kpi7.aiPct },
              { name: 'Unrouted', value: data.kpi7.unroutedPct },
            ]}
          />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Avg Call Length per Hour</h2>
          <HourlyDurationChart data={data.kpi10.series} />
        </div>
        {period === 'this-month' ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2">
            <h2 className="text-lg font-semibold">Avg Calls per Day-of-Week</h2>
            <DayOfWeekChart data={data.kpi9.series} />
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
        <h2 className="text-lg font-semibold">AI Voice Assist Health</h2>
        <p className="mt-2 text-sm text-slate-600">Reserved for Part 2 after Part 1 manual validation.</p>
      </section>
    </main>
  )
}
