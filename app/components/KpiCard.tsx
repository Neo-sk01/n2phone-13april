type Props = {
  label: string
  value: string
  helper?: string
  tone?: 'default' | 'good' | 'bad'
}

export function KpiCard({ label, value, helper, tone = 'default' }: Props) {
  const toneClass =
    tone === 'good' ? 'text-lime-400' : tone === 'bad' ? 'text-red-400' : 'text-lime-300'

  return (
    <article className="rounded-2xl border border-lime-800/30 bg-[#111411] p-5">
      <p className="text-sm text-lime-300/60">{label}</p>
      <p className={`mt-3 text-3xl font-semibold ${toneClass}`}>{value}</p>
      {helper ? <p className="mt-2 text-xs text-lime-400/40">{helper}</p> : null}
    </article>
  )
}
