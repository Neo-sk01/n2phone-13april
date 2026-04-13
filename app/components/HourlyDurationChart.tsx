'use client'

import { LineChart, Line, XAxis, YAxis } from 'recharts'

export function HourlyDurationChart({
  data,
}: {
  data: Array<{ hour: number; average_seconds: number }>
}) {
  return (
    <LineChart width={640} height={260} data={data}>
      <XAxis dataKey="hour" />
      <YAxis />
      <Line type="monotone" dataKey="average_seconds" stroke="#0f172a" strokeWidth={2} />
    </LineChart>
  )
}
