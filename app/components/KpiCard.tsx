type Props = {
  label: string
  value: string
  helper?: string
  tone?: 'default' | 'good' | 'bad'
}

export function KpiCard({ label, value, helper, tone = 'default' }: Props) {
  const toneClass =
    tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-rose-700' : 'text-slate-900'

  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <p className="text-sm text-slate-600">{label}</p>
      <p className={`mt-3 text-3xl font-semibold ${toneClass}`}>{value}</p>
      {helper ? <p className="mt-2 text-xs text-slate-500">{helper}</p> : null}
    </article>
  )
}
