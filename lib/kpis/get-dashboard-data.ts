import { computeKpi1 } from './kpi-1-total-incoming'
import { computeKpi2 } from './kpi-2-dropped'
import { computeKpi3 } from './kpi-3-english'
import { computeKpi4 } from './kpi-4-french'
import { computeKpi5 } from './kpi-5-ai'
import { computeKpi6 } from './kpi-6-pct-dropped'
import { computeKpi7 } from './kpi-7-language-split'
import { computeKpi8 } from './kpi-8-avg-length'
import { computeKpi9 } from './kpi-9-day-of-week'
import { computeKpi10 } from './kpi-10-hourly-length'
import { computeKpi11 } from './kpi-11-correlation-rate'
import { computeKpi12 } from './kpi-12-unmatched-calls'
import { computeKpi13 } from './kpi-13-sla-compliance'
import { computeKpi14 } from './kpi-14-resolution-time'
import { computeShortCalls } from './short-calls'

export async function getDashboardData(
  period: { start: Date; end: Date },
  options: { includeWeekends?: boolean } = {},
) {
  const [
    kpi1,
    kpi2,
    kpi3,
    kpi4,
    kpi5,
    kpi6,
    kpi7,
    kpi8,
    kpi9,
    kpi10,
    kpi11,
    kpi12,
    kpi13,
    kpi14,
    shortCalls,
  ] = await Promise.all([
    computeKpi1(period, options),
    computeKpi2(period, options),
    computeKpi3(period, options),
    computeKpi4(period, options),
    computeKpi5(period, options),
    computeKpi6(period, options),
    computeKpi7(period, options),
    computeKpi8(period, options),
    computeKpi9(period, options),
    computeKpi10(period, options),
    computeKpi11(period),
    computeKpi12(period),
    computeKpi13(period),
    computeKpi14(period),
    computeShortCalls(period, options),
  ])

  return {
    kpi1,
    kpi2,
    kpi3,
    kpi4,
    kpi5,
    kpi6,
    kpi7,
    kpi8,
    kpi9,
    kpi10,
    kpi11,
    kpi12,
    kpi13,
    kpi14,
    shortCalls,
  }
}
