import { computeKpi1 } from './kpi-1-total-incoming'
import { computeKpi3 } from './kpi-3-english'
import { computeKpi4 } from './kpi-4-french'
import { computeKpi5 } from './kpi-5-ai'

export async function computeKpi7(
  period: { start: Date; end: Date },
  options: { includeWeekends?: boolean } = {},
) {
  const [incoming, english, french, ai] = await Promise.all([
    computeKpi1(period, options),
    computeKpi3(period, options),
    computeKpi4(period, options),
    computeKpi5(period, options),
  ])

  // Every numerator here is from queue_stats (calls_offered per queue), so the
  // denominator must also be queue-based. Mixing in logical_calls (primaryCount)
  // made the percentages drift whenever the two methods disagreed. When the
  // queue count is zero we return zeros rather than faking a divisor.
  const total = incoming.queueCount
  if (total === 0) {
    return { englishPct: 0, frenchPct: 0, aiPct: 0, unroutedPct: 0 }
  }

  const englishPct = english.totalEnglish / total
  const frenchPct = french.totalFrench / total
  const aiPct = ai.totalAi / total

  return {
    englishPct,
    frenchPct,
    aiPct,
    unroutedPct: Math.max(0, 1 - (englishPct + frenchPct + aiPct)),
  }
}
