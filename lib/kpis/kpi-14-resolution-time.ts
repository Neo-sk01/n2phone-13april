import { getPool } from '@/lib/db/client'

export async function computeKpi14(period: { start: Date; end: Date }) {
  const pool = getPool()
  const { rows } = await pool.query(
    `WITH correlated_resolved AS (
       SELECT DISTINCT t.id,
              extract(epoch FROM (t.resolved_date_time - t.date_entered)) / 60 AS minutes
         FROM connectwise_correlations cc
         JOIN tickets t ON t.id = cc.ticket_id AND t.month = cc.month
         JOIN ai_candidate_calls a
           ON a.cdr_id = cc.cdr_id AND a.month = cc.month
        WHERE a.start_time >= $1 AND a.start_time <= $2
          AND t.resolved_date_time IS NOT NULL
     )
     SELECT COUNT(*)::int                                                  AS count,
            AVG(minutes)                                                    AS mean_minutes,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes)            AS median_minutes,
            percentile_cont(0.9) WITHIN GROUP (ORDER BY minutes)            AS p90_minutes
       FROM correlated_resolved`,
    [period.start, period.end],
  )
  const r = rows[0] ?? {}
  return {
    count: Number(r.count ?? 0),
    meanMinutes: r.mean_minutes == null ? 0 : Number(r.mean_minutes),
    medianMinutes: r.median_minutes == null ? 0 : Number(r.median_minutes),
    p90Minutes: r.p90_minutes == null ? 0 : Number(r.p90_minutes),
  }
}
