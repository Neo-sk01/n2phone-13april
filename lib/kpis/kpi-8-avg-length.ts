import { getAverageTalkTimes } from '@/lib/db/queries'

export async function computeKpi8(
  period: { start: Date; end: Date },
  options: { includeWeekends?: boolean } = {},
) {
  return {
    rows: await getAverageTalkTimes(period, options),
  }
}
