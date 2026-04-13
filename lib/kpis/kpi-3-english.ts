import { ENGLISH_QUEUE_ID } from '@/lib/versature/queues'
import { getCallsOfferedForQueues } from '@/lib/db/queries'

export async function computeKpi3(
  period: { start: Date; end: Date },
  options: { includeWeekends?: boolean } = {},
) {
  return {
    totalEnglish: await getCallsOfferedForQueues(period, [ENGLISH_QUEUE_ID], options),
  }
}
