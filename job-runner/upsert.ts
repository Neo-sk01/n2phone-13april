import type { PoolClient } from 'pg'
import { withTransaction } from './db'
import type { VersatureCdr } from '@/lib/versature/types'

const BATCH = 500

export async function upsertCDRBatch(cdrs: VersatureCdr[], month: string): Promise<void> {
  for (let i = 0; i < cdrs.length; i += BATCH) {
    const chunk = cdrs.slice(i, i + BATCH)
    await withTransaction(async (client: PoolClient) => {
      for (const c of chunk) {
        const id = c.id ?? c.from?.call_id ?? `${c.start_time}-${c.from?.id ?? 'unknown'}`
        await client.query(
          `INSERT INTO cdrs
            (id, month, from_call_id, from_value, from_name, from_user,
             to_value, to_user, to_id, start_time, answer_time, end_time,
             duration, call_type, raw)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
          ON CONFLICT (id, month) DO UPDATE SET
            from_call_id = EXCLUDED.from_call_id,
            answer_time  = EXCLUDED.answer_time,
            duration     = EXCLUDED.duration,
            raw          = EXCLUDED.raw`,
          [
            id,
            month,
            c.from.call_id ?? '',
            c.from.id ?? c.from.number ?? null,
            c.from.name ?? null,
            c.from.user ?? null,
            c.to.id ?? null,
            c.to.user ?? null,
            c.to.id ?? null,
            c.start_time ? new Date(c.start_time) : null,
            c.answer_time ? new Date(c.answer_time) : null,
            c.end_time ? new Date(c.end_time) : null,
            c.duration,
            c.call_type ?? null,
            JSON.stringify(c),
          ],
        )
      }
    })
  }
}

export type QueueStatsRow = {
  queue?: string
  description?: string
  call_volume?: number
  calls_offered?: number
  calls_handled?: number
  abandoned_calls?: number
  calls_forwarded?: number
  average_talk_time?: string | number
  average_handle_time?: string | number
  average_answer_speed?: string | number
  service_level?: string | number
  abandoned_rate?: string | number
}

export async function upsertQueueStats(
  stats: QueueStatsRow,
  queueId: string,
  month: string,
): Promise<void> {
  const { getPool } = await import('./db')
  const pool = getPool()
  await pool.query(
    `INSERT INTO queue_stats
      (queue_id, month, description, call_volume, calls_offered, calls_handled,
       abandoned_calls, calls_forwarded, average_talk_time, average_handle_time,
       average_answer_speed, service_level, abandoned_rate, raw)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    ON CONFLICT (queue_id, month) DO UPDATE SET
      calls_offered     = EXCLUDED.calls_offered,
      calls_handled     = EXCLUDED.calls_handled,
      abandoned_calls   = EXCLUDED.abandoned_calls,
      average_talk_time = EXCLUDED.average_talk_time,
      raw               = EXCLUDED.raw`,
    [
      queueId,
      month,
      stats.description ?? null,
      stats.call_volume ?? 0,
      stats.calls_offered ?? 0,
      stats.calls_handled ?? 0,
      stats.abandoned_calls ?? 0,
      stats.calls_forwarded ?? 0,
      parseFloat(String(stats.average_talk_time ?? 0)),
      parseFloat(String(stats.average_handle_time ?? 0)),
      parseFloat(String(stats.average_answer_speed ?? 0)),
      parseFloat(String(stats.service_level ?? 0)),
      parseFloat(String(stats.abandoned_rate ?? 0)),
      JSON.stringify(stats),
    ],
  )
}

export type TicketRow = {
  id: number
  summary?: string
  dateEntered?: string
  contact?: { phoneNumber?: string }
  source?: { id?: number }
  status?: { name?: string }
  resolvedDateTime?: string
  mergedIntoTicket?: { id?: number }
  closedFlag?: boolean
  [key: string]: unknown
}

export async function upsertTicketBatch(tickets: TicketRow[], month: string): Promise<void> {
  const { normalizePhone } = await import('@/lib/utils/phone')
  for (let i = 0; i < tickets.length; i += BATCH) {
    const chunk = tickets.slice(i, i + BATCH)
    await withTransaction(async (client: PoolClient) => {
      for (const t of chunk) {
        const phone = t.contact?.phoneNumber ?? null
        await client.query(
          `INSERT INTO tickets
            (id, month, summary, date_entered, phone_number, source_id,
             normalized_phone, status, resolved_date_time,
             merged_into_ticket_id, closed_flag, raw)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          ON CONFLICT (id, month) DO UPDATE SET
            summary               = EXCLUDED.summary,
            date_entered          = EXCLUDED.date_entered,
            normalized_phone      = EXCLUDED.normalized_phone,
            status                = EXCLUDED.status,
            resolved_date_time    = EXCLUDED.resolved_date_time,
            merged_into_ticket_id = EXCLUDED.merged_into_ticket_id,
            closed_flag           = EXCLUDED.closed_flag,
            raw                   = EXCLUDED.raw`,
          [
            t.id,
            month,
            t.summary ?? null,
            t.dateEntered ? new Date(t.dateEntered) : null,
            phone,
            t.source?.id ?? null,
            normalizePhone(phone),
            t.status?.name ?? null,
            t.resolvedDateTime ? new Date(t.resolvedDateTime) : null,
            t.mergedIntoTicket?.id ?? null,
            t.closedFlag ?? null,
            JSON.stringify(t),
          ],
        )
      }
    })
  }
}

export async function upsertKPISnapshot(month: string, kpis: Record<string, unknown>): Promise<void> {
  const { getPool } = await import('./db')
  const pool = getPool()
  await pool.query(
    `INSERT INTO monthly_kpi_snapshots (month, computed_at, kpis)
    VALUES ($1, NOW(), $2)
    ON CONFLICT (month) DO UPDATE SET
      computed_at = NOW(),
      kpis        = EXCLUDED.kpis`,
    [month, JSON.stringify(kpis)],
  )
}

export async function upsertBhKpiSnapshot(month: string, bhKpis: Record<string, unknown>): Promise<void> {
  const { getPool } = await import('./db')
  const pool = getPool()
  await pool.query(
    `INSERT INTO monthly_kpi_snapshots (month, computed_at, kpis, bh_kpis)
    VALUES ($1, NOW(), '{}'::jsonb, $2)
    ON CONFLICT (month) DO UPDATE SET
      bh_kpis = EXCLUDED.bh_kpis`,
    [month, JSON.stringify(bhKpis)],
  )
}
