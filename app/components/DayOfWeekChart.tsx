'use client'

import { BarChart, Bar, XAxis, YAxis } from 'recharts'

export function DayOfWeekChart({ data }: { data: Array<{ day: string; average: number }> }) {
  return (
    <BarChart width={640} height={260} data={data}>
      <XAxis dataKey="day" stroke="#3f6212" tick={{ fill: '#a3e635' }} />
      <YAxis stroke="#3f6212" tick={{ fill: '#a3e635' }} />
      <Bar dataKey="average" fill="#84cc16" radius={[6, 6, 0, 0]} />
    </BarChart>
  )
}
