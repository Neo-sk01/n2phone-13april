'use client'

import { PieChart, Pie, Cell } from 'recharts'

export function LanguageSplitChart({ data }: { data: Array<{ name: string; value: number }> }) {
  const colors = ['#84cc16', '#a3e635', '#3f6212', '#1a2e05']

  return (
    <PieChart width={320} height={240}>
      <Pie data={data} dataKey="value" nameKey="name" cx={160} cy={120} outerRadius={80}>
        {data.map((entry, index) => (
          <Cell key={entry.name} fill={colors[index % colors.length]} />
        ))}
      </Pie>
    </PieChart>
  )
}
