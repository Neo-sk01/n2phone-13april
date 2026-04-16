import { computeKpi1 } from './kpi-1-total-incoming'
import { computeKpi2 } from './kpi-2-dropped'

export async function computeKpi6(
  period: { start: Date; end: Date },
  options: { includeWeekends?: boolean } = {},
) {
  const incoming = await computeKpi1(period, options)
  const dropped = await computeKpi2(period, options)

  // Both numerator (abandoned_calls) and denominator (calls_offered) must come
  // from the same source or the rate is meaningless. Queue stats is the
  // correct pairing — logical_calls is DNIS-derived and counts a different
  // population than queue_stats_daily's abandoned_calls.
  return {
    rate: incoming.queueCount === 0 ? 0 : dropped.totalDropped / incoming.queueCount,
    dropped: dropped.totalDropped,
    total: incoming.queueCount,
  }
}
