import { AI_OVERFLOW_QUEUE_IDS, ENGLISH_QUEUE_ID, FRENCH_QUEUE_ID } from '@/lib/versature/queues'
import { getCallsOfferedForQueues, getLogicalCallCountForPeriod } from '@/lib/db/queries'

export type Kpi1Result = {
  primaryCount: number
  queueCount: number
  deltaPct: number
  warning: string | null
}

export async function computeKpi1(
  period: { start: Date; end: Date },
  options: { includeWeekends?: boolean } = {},
): Promise<Kpi1Result> {
  const primaryCount = await getLogicalCallCountForPeriod(period, options)
  const queueCount = await getCallsOfferedForQueues(period, [
    ENGLISH_QUEUE_ID,
    FRENCH_QUEUE_ID,
    ...AI_OVERFLOW_QUEUE_IDS,
  ], options)

  const deltaPct = queueCount === 0 ? 0 : Math.abs(primaryCount - queueCount) / queueCount * 100
  const warning =
    deltaPct > 2
      ? `KPI #1 methods differ by more than 2% (${deltaPct.toFixed(1)}%)`
      : null

  if (warning) {
    console.warn(warning)
  }

  return {
    primaryCount,
    queueCount,
    deltaPct,
    warning,
  }
}
