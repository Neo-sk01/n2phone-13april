import { FRENCH_QUEUE_ID } from '@/lib/versature/queues'
import { getCallsOfferedForQueues } from '@/lib/db/queries'

export async function computeKpi4(
  period: { start: Date; end: Date },
  options: { includeWeekends?: boolean } = {},
) {
  return {
    totalFrench: await getCallsOfferedForQueues(period, [FRENCH_QUEUE_ID], options),
  }
}
