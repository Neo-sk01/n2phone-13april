import { describe, expect, test } from 'vitest'
import {
  computeAiHealthStatus,
  stripAiHealthKpis,
  type AiHealthStageFlags,
} from '../../job-runner/ai-health-status'

describe('computeAiHealthStatus', () => {
  test('complete when all three stages succeed', () => {
    const flags: AiHealthStageFlags = { aiCdrsOk: true, ticketsOk: true, correlationOk: true }
    expect(computeAiHealthStatus(flags)).toBe('complete')
  })

  test('degraded when AI CDR fetch failed', () => {
    expect(computeAiHealthStatus({ aiCdrsOk: false, ticketsOk: true, correlationOk: true })).toBe(
      'degraded',
    )
  })

  test('degraded when ticket fetch failed', () => {
    expect(computeAiHealthStatus({ aiCdrsOk: true, ticketsOk: false, correlationOk: true })).toBe(
      'degraded',
    )
  })

  test('degraded when correlation failed', () => {
    expect(computeAiHealthStatus({ aiCdrsOk: true, ticketsOk: true, correlationOk: false })).toBe(
      'degraded',
    )
  })

  test('degraded when multiple stages failed', () => {
    expect(computeAiHealthStatus({ aiCdrsOk: false, ticketsOk: false, correlationOk: false })).toBe(
      'degraded',
    )
  })
})

describe('stripAiHealthKpis', () => {
  test('removes kpi11..kpi14 from the payload', () => {
    const snapshot = {
      kpi1: { totalIncoming: 100 },
      kpi10: { series: [] },
      kpi11: { rate: 0.75 },
      kpi12: { totalUnmatched: 5 },
      kpi13: { overall: { rate: 0.8 } },
      kpi14: { medianMinutes: 30 },
      shortCalls: { totalShortCalls: 1 },
      dataSource: 'historical',
    }
    const stripped = stripAiHealthKpis(snapshot)
    expect(stripped.kpi1).toEqual({ totalIncoming: 100 })
    expect(stripped.kpi10).toEqual({ series: [] })
    expect(stripped.shortCalls).toEqual({ totalShortCalls: 1 })
    expect(stripped.dataSource).toBe('historical')
    expect('kpi11' in stripped).toBe(false)
    expect('kpi12' in stripped).toBe(false)
    expect('kpi13' in stripped).toBe(false)
    expect('kpi14' in stripped).toBe(false)
  })

  test('is a no-op when the payload has no ai-health KPIs', () => {
    const snapshot = { kpi1: { x: 1 }, kpi2: { y: 2 } }
    expect(stripAiHealthKpis(snapshot)).toEqual({ kpi1: { x: 1 }, kpi2: { y: 2 } })
  })

  test('returns a new object, does not mutate the input', () => {
    const snapshot = { kpi1: { x: 1 }, kpi11: { rate: 0.5 } }
    const stripped = stripAiHealthKpis(snapshot)
    expect('kpi11' in snapshot).toBe(true)
    expect('kpi11' in stripped).toBe(false)
  })
})
