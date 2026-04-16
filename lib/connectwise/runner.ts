import { fromZonedTime } from 'date-fns-tz'
import { getPool } from '@/lib/db/client'
import {
  correlateCall,
  type CallForCorrelation,
  type TicketForCorrelation,
  type Confidence,
} from './correlate'

const TZ = 'America/Toronto'

// Correlation fuzzy window is -1h..+4h from call.startTime. To avoid missing
// valid matches when a call near a month boundary points at a ticket in the
// adjacent month, we load tickets by timestamp window (month ± the correlation
// window), not by the `month` partition key.
const TICKET_WINDOW_PAD_BEFORE_MS = 60 * 60_000
const TICKET_WINDOW_PAD_AFTER_MS = 4 * 60 * 60_000

export function monthToTicketWindow(month: string): { start: Date; end: Date } {
  const [year, mo] = month.split('-').map(Number)
  // Last calendar day of `month`. Using UTC Date math purely for the day number.
  const lastDay = new Date(Date.UTC(year, mo, 0)).getUTCDate()
  const mm = String(mo).padStart(2, '0')
  const dd = String(lastDay).padStart(2, '0')
  // Parse as Toronto wall-clock time, not machine local time.
  const monthStartUtc = fromZonedTime(`${year}-${mm}-01T00:00:00.000`, TZ)
  const monthEndUtc = fromZonedTime(`${year}-${mm}-${dd}T23:59:59.999`, TZ)
  return {
    start: new Date(monthStartUtc.getTime() - TICKET_WINDOW_PAD_BEFORE_MS),
    end: new Date(monthEndUtc.getTime() + TICKET_WINDOW_PAD_AFTER_MS),
  }
}

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
  const window = monthToTicketWindow(month)

  const callsRes = await pool.query(
    `SELECT cdr_id, normalized_phone, start_time
       FROM ai_candidate_calls
      WHERE month = $1`,
    [month],
  )
  // Tickets are queried by date_entered window so that a call near a month
  // boundary can match a ticket created in the adjacent month. DISTINCT ON (id)
  // collapses duplicates when the same ticket got upserted into two month
  // partitions during overlapping pulls — most recent wins.
  const ticketsRes = await pool.query(
    `SELECT DISTINCT ON (id) id, normalized_phone, date_entered
       FROM tickets
      WHERE date_entered >= $1
        AND date_entered <= $2
        AND merged_into_ticket_id IS NULL
      ORDER BY id, month DESC`,
    [window.start, window.end],
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
