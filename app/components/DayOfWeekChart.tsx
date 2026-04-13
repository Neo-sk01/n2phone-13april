'use client'

import { BarChart, Bar, XAxis, YAxis } from 'recharts'

export function DayOfWeekChart({ data }: { data: Array<{ day: string; average: number }> }) {
  return (
    <BarChart width={640} height={260} data={data}>
      <XAxis dataKey="day" />
      <YAxis />
      <Bar dataKey="average" fill="#0f172a" radius={[6, 6, 0, 0]} />
    </BarChart>
  )
}
