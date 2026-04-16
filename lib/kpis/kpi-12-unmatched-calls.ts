import { getPool } from '@/lib/db/client'

export interface UnmatchedSample {
  cdrId: string
  fromNumber: string | null
  startTime: string
  queue: string
}

export async function computeKpi12(period: { start: Date; end: Date }) {
  const pool = getPool()

  const breakdown = await pool.query(
    `SELECT a.to_user, COUNT(*)::int AS unmatched
       FROM ai_candidate_calls a
  LEFT JOIN connectwise_correlations c
         ON c.cdr_id = a.cdr_id AND c.month = a.month
      WHERE a.start_time >= $1 AND a.start_time <= $2
        AND c.ticket_id IS NULL
   GROUP BY a.to_user
   ORDER BY a.to_user`,
    [period.start, period.end],
  )

  const sample = await pool.query(
    `SELECT a.cdr_id, a.from_number, a.start_time, a.to_user
       FROM ai_candidate_calls a
  LEFT JOIN connectwise_correlations c
         ON c.cdr_id = a.cdr_id AND c.month = a.month
      WHERE a.start_time >= $1 AND a.start_time <= $2
        AND c.ticket_id IS NULL
   ORDER BY a.start_time DESC
      LIMIT 20`,
    [period.start, period.end],
  )

  const byQueue = breakdown.rows.map((r) => ({
    queue: String(r.to_user),
    count: Number(r.unmatched),
  }))
  const totalUnmatched = byQueue.reduce((s, r) => s + r.count, 0)

  return {
    totalUnmatched,
    byQueue,
    sample: sample.rows.map(
      (r): UnmatchedSample => ({
        cdrId: r.cdr_id,
        fromNumber: r.from_number,
        startTime: r.start_time instanceof Date ? r.start_time.toISOString() : String(r.start_time),
        queue: String(r.to_user),
      }),
    ),
  }
}
