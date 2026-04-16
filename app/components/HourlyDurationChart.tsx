'use client'

import { LineChart, Line, XAxis, YAxis } from 'recharts'

export function HourlyDurationChart({
  data,
}: {
  data: Array<{ hour: number; average_seconds: number }>
}) {
  return (
    <LineChart width={640} height={260} data={data}>
      <XAxis dataKey="hour" stroke="#3f6212" tick={{ fill: '#a3e635' }} />
      <YAxis stroke="#3f6212" tick={{ fill: '#a3e635' }} />
      <Line type="monotone" dataKey="average_seconds" stroke="#84cc16" strokeWidth={2} dot={{ fill: '#a3e635' }} />
    </LineChart>
  )
}
