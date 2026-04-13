import { AI_OVERFLOW_QUEUE_IDS } from '@/lib/versature/queues'
import { getCallsOfferedForQueues } from '@/lib/db/queries'

export async function computeKpi5(
  period: { start: Date; end: Date },
  options: { includeWeekends?: boolean } = {},
) {
  return {
    totalAi: await getCallsOfferedForQueues(period, [...AI_OVERFLOW_QUEUE_IDS], options),
  }
}
