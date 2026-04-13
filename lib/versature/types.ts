export type VersatureCdr = {
  id?: string
  call_id?: string | null
  call_type?: string
  start_time: string
  answer_time: string | null
  end_time: string
  duration: number
  from: {
    id?: string | null
    name?: string | null
    user?: string | null
    number?: string | null
    call_id?: string | null
    domain?: string | null
  }
  to: {
    id?: string | null
    call_id?: string | null
    user?: string | null
    domain?: string | null
  }
  [key: string]: unknown
}

export type QueueStats = {
  calls_offered: number
  abandoned_calls: number
  abandoned_rate: number
  average_talk_time: number
  average_handle_time: number
}

export type QueueSplit = {
  interval: string
  volume: number
}

export type DashboardData = {
  kpi1: unknown
  kpi2: unknown
  kpi3: unknown
  kpi4: unknown
  kpi5: unknown
  kpi6: unknown
  kpi7: unknown
  kpi8: unknown
  kpi9: unknown
  kpi10: unknown
  shortCalls: unknown
  dataSource?: 'live' | 'cached' | 'historical'
  lastUpdated?: string
}
