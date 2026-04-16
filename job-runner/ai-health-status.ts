export type AiHealthStatus = 'complete' | 'degraded' | 'unknown'

export interface AiHealthStageFlags {
  aiCdrsOk: boolean
  ticketsOk: boolean
  correlationOk: boolean
}

export function computeAiHealthStatus(flags: AiHealthStageFlags): AiHealthStatus {
  return flags.aiCdrsOk && flags.ticketsOk && flags.correlationOk ? 'complete' : 'degraded'
}

const AI_HEALTH_KPI_KEYS = ['kpi11', 'kpi12', 'kpi13', 'kpi14'] as const

export function stripAiHealthKpis<T extends Record<string, unknown>>(
  snapshot: T,
): Omit<T, (typeof AI_HEALTH_KPI_KEYS)[number]> {
  const out = { ...snapshot }
  for (const k of AI_HEALTH_KPI_KEYS) {
    delete (out as Record<string, unknown>)[k]
  }
  return out as Omit<T, (typeof AI_HEALTH_KPI_KEYS)[number]>
}
