import type { UnmatchedSample } from '@/lib/kpis/kpi-12-unmatched-calls'

export function UncorrelatedCallsTable({ rows }: { rows: UnmatchedSample[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-lime-300/60">No uncorrelated AI calls in this period.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-[0.15em] text-lime-400/70">
            <th className="py-2 pr-4">Time</th>
            <th className="py-2 pr-4">Caller</th>
            <th className="py-2 pr-4">Queue</th>
            <th className="py-2 pr-4">CDR ID</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.cdrId} className="border-t border-lime-800/30 text-lime-100">
              <td className="py-2 pr-4">{new Date(r.startTime).toLocaleString()}</td>
              <td className="py-2 pr-4">{r.fromNumber ?? '—'}</td>
              <td className="py-2 pr-4">{r.queue}</td>
              <td className="py-2 pr-4 font-mono text-xs text-lime-400/70">{r.cdrId}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
