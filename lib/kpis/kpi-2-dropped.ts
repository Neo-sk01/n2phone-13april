import { AI_OVERFLOW_QUEUE_IDS, ENGLISH_QUEUE_ID, FRENCH_QUEUE_ID } from '@/lib/versature/queues'
import { getAbandonedCallsForQueues } from '@/lib/db/queries'

export async function computeKpi2(
  period: { start: Date; end: Date },
  options: { includeWeekends?: boolean } = {},
) {
  const totalDropped = await getAbandonedCallsForQueues(period, [
    ENGLISH_QUEUE_ID,
    FRENCH_QUEUE_ID,
    ...AI_OVERFLOW_QUEUE_IDS,
  ], options)

  return { totalDropped }
}
