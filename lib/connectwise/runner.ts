import { getPool } from '@/lib/db/client'
import {
  correlateCall,
  type CallForCorrelation,
  type TicketForCorrelation,
  type Confidence,
} from './correlate'

export interface CorrelationRowOut {
  cdrId: string
  ticketId: number | null
  confidence: Confidence
  reason: string
}

export function correlateAll(
  calls: CallForCorrelation[],
  tickets: TicketForCorrelation[],
): CorrelationRowOut[] {
  return calls.map((c) => {
    const { ticketId, confidence, reason } = correlateCall(c, tickets)
    return { cdrId: c.cdrId, ticketId, confidence, reason }
  })
}

export interface MonthlyCorrelationResult {
  candidates: number
  matched: number
  exact: number
  fuzzy: number
}

const BATCH = 500

export async function runMonthlyCorrelation(
  month: string,
): Promise<MonthlyCorrelationResult> {
  const pool = getPool()

  const callsRes = await pool.query(
    `SELECT cdr_id, normalized_phone, start_time
       FROM ai_candidate_calls
      WHERE month = $1`,
    [month],
  )
  const ticketsRes = await pool.query(
    `SELECT id, normalized_phone, date_entered
       FROM tickets
      WHERE month = $1
        AND merged_into_ticket_id IS NULL`,
    [month],
  )

  const calls: CallForCorrelation[] = callsRes.rows.map((r) => ({
    cdrId: r.cdr_id,
    normalizedPhone: r.normalized_phone,
    startTime: r.start_time,
  }))
  const tickets: TicketForCorrelation[] = ticketsRes.rows.map((r) => ({
    id: r.id,
    normalizedPhone: r.normalized_phone,
    dateEntered: r.date_entered,
  }))

  const rows = correlateAll(calls, tickets)
  const matched = rows.filter((r) => r.ticketId !== null)

  for (let i = 0; i < matched.length; i += BATCH) {
    const chunk = matched.slice(i, i + BATCH)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const r of chunk) {
        await client.query(
          `INSERT INTO connectwise_correlations (cdr_id, month, ticket_id, confidence, reason)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (cdr_id, month, ticket_id) DO UPDATE SET
             confidence = EXCLUDED.confidence,
             reason     = EXCLUDED.reason`,
          [r.cdrId, month, r.ticketId, r.confidence, r.reason],
        )
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  return {
    candidates: calls.length,
    matched: matched.length,
    exact: rows.filter((r) => r.confidence === 'exact').length,
    fuzzy: rows.filter((r) => r.confidence === 'fuzzy').length,
  }
}
