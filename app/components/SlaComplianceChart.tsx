'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

export type SlaPoint = { date: string; rate: number; resolved: number; met: number }

export function SlaComplianceChart({ data }: { data: SlaPoint[] }) {
  const asPct = data.map((d) => ({ ...d, pct: Math.round(d.rate * 100) }))
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <LineChart data={asPct} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <XAxis dataKey="date" tick={{ fill: '#a3e635', fontSize: 11 }} />
          <YAxis domain={[0, 100]} tick={{ fill: '#a3e635', fontSize: 11 }} unit="%" />
          <Tooltip
            contentStyle={{ background: '#0a0a0a', border: '1px solid #365314' }}
            labelStyle={{ color: '#ecfccb' }}
          />
          <ReferenceLine y={80} stroke="#65a30d" strokeDasharray="3 3" />
          <Line type="monotone" dataKey="pct" stroke="#a3e635" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
