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

  const total = incoming.primaryCount || 1
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
