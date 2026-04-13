import { getAverageAnsweredDurationByHour } from '@/lib/db/queries'

export async function computeKpi10(
  period: { start: Date; end: Date },
  options: { includeWeekends?: boolean } = {},
) {
  return {
    series: await getAverageAnsweredDurationByHour(period, options),
  }
}
