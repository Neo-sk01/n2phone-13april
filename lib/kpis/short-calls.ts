import { getShortAnsweredCallCount } from '@/lib/db/queries'

export async function computeShortCalls(
  period: { start: Date; end: Date },
  options: { includeWeekends?: boolean } = {},
) {
  return {
    totalShortCalls: await getShortAnsweredCallCount(period, 10, options),
    thresholdSeconds: 10,
  }
}
