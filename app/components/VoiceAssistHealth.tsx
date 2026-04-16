import { KpiCard } from './KpiCard'
import { InfoButton } from './InfoButton'
import { SlaComplianceChart } from './Charts'
import { UncorrelatedCallsTable } from './UncorrelatedCallsTable'
import type { UnmatchedSample } from '@/lib/kpis/kpi-12-unmatched-calls'

interface Kpi11 {
  candidates: number
  matched: number
  exact: number
  fuzzy: number
  rate: number
}
interface Kpi12 {
  totalUnmatched: number
  byQueue: { queue: string; count: number }[]
  sample: UnmatchedSample[]
}
interface Kpi13 {
  overall: { resolved: number; met: number; open: number; rate: number }
  daily: { date: string; resolved: number; met: number; rate: number }[]
}
interface Kpi14 {
  count: number
  meanMinutes: number
  medianMinutes: number
  p90Minutes: number
}

export type AiHealthStatus = 'complete' | 'degraded' | 'unknown'

export function VoiceAssistHealth({
  kpi11,
  kpi12,
  kpi13,
  kpi14,
  aiHealthStatus,
}: {
  // All four KPIs are optional. When the snapshot was written for a degraded
  // month the backend strips them, and when a legacy snapshot predates Part 2
  // they were never there. Either way, we render an explicit unavailable
  // state instead of fabricated zeros.
  kpi11?: Kpi11
  kpi12?: Kpi12
  kpi13?: Kpi13
  kpi14?: Kpi14
  aiHealthStatus?: AiHealthStatus
}) {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`
  const minutes = (n: number) => `${Math.round(n)}m`

  // Any missing KPI or a non-complete health status is treated as unavailable.
  // If Part 1 succeeded and AI-health ran cleanly, the snapshot carries all
  // four KPIs and aiHealthStatus === 'complete'.
  const degraded =
    !kpi11 ||
    !kpi12 ||
    !kpi13 ||
    !kpi14 ||
    (aiHealthStatus !== undefined && aiHealthStatus !== 'complete')

  return (
    <section className="rounded-2xl border border-lime-800/40 bg-[#111411] p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-lime-300">AI Voice Assist Health</h2>
        <InfoButton title="What is this?">
          We match each AI-queue call to a ConnectWise ticket using caller phone and a time
          window. Correlation rate measures how often the AI produced a downstream ticket. SLA
          compliance looks at whether correlated tickets were resolved within 24 hours.
        </InfoButton>
      </div>

      {degraded ? (
        <DegradedState status={aiHealthStatus} />
      ) : (
        <HealthyContent kpi11={kpi11!} kpi12={kpi12!} kpi13={kpi13!} kpi14={kpi14!} pct={pct} minutes={minutes} />
      )}
    </section>
  )
}

function DegradedState({ status }: { status?: AiHealthStatus }) {
  const label =
    status === 'degraded'
      ? 'AI-health data is unavailable for this period.'
      : status === 'unknown'
        ? 'AI-health data was not tracked for this period.'
        : 'AI-health data is unavailable.'
  const detail =
    status === 'degraded'
      ? 'One or more ingestion stages (AI CDRs, ConnectWise tickets, correlation) failed during the last pull. Use the Repair button above to re-run the pull and recover these metrics.'
      : 'This period was pulled before the AI-health pipeline was tracked. Re-pull the month to populate these metrics.'

  return (
    <>
      <p className="mt-1 text-xs text-amber-300/80">{label}</p>
      <div className="mt-4 rounded-2xl border border-amber-700/40 bg-amber-950/20 p-4 text-sm text-amber-200/80">
        {detail}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <UnavailableCard label="Correlation Rate" />
        <UnavailableCard label="Uncorrelated AI Calls" />
        <UnavailableCard label="SLA Compliance (24h)" />
        <UnavailableCard label="Median Resolution Time" />
      </div>
    </>
  )
}

function UnavailableCard({ label }: { label: string }) {
  return (
    <article className="rounded-2xl border border-lime-800/30 bg-[#111411] p-5">
      <p className="text-sm text-lime-300/60">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-lime-400/40">—</p>
      <p className="mt-2 text-xs text-lime-400/40">Data unavailable</p>
    </article>
  )
}

function HealthyContent({
  kpi11,
  kpi12,
  kpi13,
  kpi14,
  pct,
  minutes,
}: {
  kpi11: Kpi11
  kpi12: Kpi12
  kpi13: Kpi13
  kpi14: Kpi14
  pct: (n: number) => string
  minutes: (n: number) => string
}) {
  return (
    <>
      <p className="mt-1 text-xs text-lime-400/60">
        Correlation is heuristic (phone + time window). Treat numbers as indicative, not exact.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Correlation Rate"
          value={pct(kpi11.rate)}
          helper={`${kpi11.matched} of ${kpi11.candidates} AI calls matched`}
        />
        <KpiCard
          label="Uncorrelated AI Calls"
          value={String(kpi12.totalUnmatched)}
          helper={
            kpi12.byQueue.length > 0
              ? kpi12.byQueue.map((q) => `${q.queue}: ${q.count}`).join(' · ')
              : undefined
          }
          tone={kpi12.totalUnmatched > 0 ? 'bad' : 'default'}
        />
        <KpiCard
          label="SLA Compliance (24h)"
          value={pct(kpi13.overall.rate)}
          helper={`${kpi13.overall.met}/${kpi13.overall.resolved} met · ${kpi13.overall.open} open`}
          tone={kpi13.overall.rate < 0.8 && kpi13.overall.resolved > 0 ? 'bad' : 'default'}
        />
        <KpiCard
          label="Median Resolution Time"
          value={minutes(kpi14.medianMinutes)}
          helper={`p90 ${minutes(kpi14.p90Minutes)} · n=${kpi14.count}`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-lime-200">SLA Compliance — Daily</h3>
            <InfoButton title="SLA compliance">
              Share of correlated tickets resolved within 24 hours of `dateEntered`. Dashed line =
              80% target.
            </InfoButton>
          </div>
          <div className="mt-2 rounded-2xl border border-lime-800/30 bg-[#0a0a0a] p-3">
            <SlaComplianceChart data={kpi13.daily} />
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-lime-200">
              Uncorrelated AI Calls (recent 20)
            </h3>
            <InfoButton title="Why this list exists">
              Calls that hit an AI-overflow extension but had no matching ConnectWise ticket
              created within the time window. Review to confirm whether they needed a ticket.
            </InfoButton>
          </div>
          <div className="mt-2 rounded-2xl border border-lime-800/30 bg-[#0a0a0a] p-3">
            <UncorrelatedCallsTable rows={kpi12.sample} />
          </div>
        </div>
      </div>
    </>
  )
}
