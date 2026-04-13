import { getWeekdaySplitRowsForPeriod } from '@/lib/db/queries'

export async function computeKpi9(
  period: { start: Date; end: Date },
  options: { includeWeekends?: boolean } = {},
) {
  const rows = await getWeekdaySplitRowsForPeriod(period, options)
  const totals = new Map<string, { sum: number; count: number }>()

  for (const row of rows) {
    const current = totals.get(row.weekday) ?? { sum: 0, count: 0 }
    current.sum += row.volume
    current.count += 1
    totals.set(row.weekday, current)
  }

  return {
    series: [...totals.entries()].map(([day, value]) => ({
      day,
      average: value.sum / value.count,
    })),
  }
}
