import { computeKpi1 } from './kpi-1-total-incoming'
import { computeKpi2 } from './kpi-2-dropped'

export async function computeKpi6(
  period: { start: Date; end: Date },
  options: { includeWeekends?: boolean } = {},
) {
  const incoming = await computeKpi1(period, options)
  const dropped = await computeKpi2(period, options)

  return {
    rate: incoming.primaryCount === 0 ? 0 : dropped.totalDropped / incoming.primaryCount,
    dropped: dropped.totalDropped,
    total: incoming.primaryCount,
  }
}
