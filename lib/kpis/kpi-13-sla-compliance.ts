import { getPool } from '@/lib/db/client'

const SLA_HOURS = 24

// Tickets are joined by id only (not id+month). A call near a month boundary
// can correlate to a ticket stored in an adjacent month partition; pinning
// `t.month = cc.month` would silently drop those boundary matches.
// DISTINCT ON (t.id) collapses any duplicate rows when the same ticket was
// upserted into multiple month partitions by overlapping pulls.
const METRICS_CTE = `
  WITH correlated_tickets AS (
    SELECT DISTINCT ON (t.id) t.id, t.date_entered, t.resolved_date_time
      FROM connectwise_correlations cc
      JOIN tickets t ON t.id = cc.ticket_id
      JOIN ai_candidate_calls a
        ON a.cdr_id = cc.cdr_id AND a.month = cc.month
     WHERE a.start_time >= $1 AND a.start_time <= $2
     ORDER BY t.id, t.month DESC
  )
`

export async function computeKpi13(period: { start: Date; end: Date }) {
  const pool = getPool()

  const overall = await pool.query(
    `${METRICS_CTE}
     SELECT
       COUNT(*) FILTER (WHERE resolved_date_time IS NOT NULL)::int AS resolved,
       COUNT(*) FILTER (
         WHERE resolved_date_time IS NOT NULL
           AND resolved_date_time - date_entered <= interval '${SLA_HOURS} hours'
       )::int                                                       AS met,
       COUNT(*) FILTER (WHERE resolved_date_time IS NULL)::int      AS open
       FROM correlated_tickets`,
    [period.start, period.end],
  )

  const daily = await pool.query(
    `${METRICS_CTE}
     SELECT to_char(date_trunc('day', date_entered), 'YYYY-MM-DD') AS day,
            COUNT(*) FILTER (WHERE resolved_date_time IS NOT NULL)::int AS resolved,
            COUNT(*) FILTER (
              WHERE resolved_date_time IS NOT NULL
                AND resolved_date_time - date_entered <= interval '${SLA_HOURS} hours'
            )::int AS met
       FROM correlated_tickets
      WHERE date_entered IS NOT NULL
   GROUP BY 1
   ORDER BY 1`,
    [period.start, period.end],
  )

  const o = overall.rows[0] ?? { resolved: 0, met: 0, open: 0 }
  const resolved = Number(o.resolved)
  const met = Number(o.met)

  return {
    overall: {
      resolved,
      met,
      open: Number(o.open),
      rate: resolved === 0 ? 0 : met / resolved,
    },
    daily: daily.rows.map((r) => {
      const res = Number(r.resolved)
      const m = Number(r.met)
      return { date: r.day, resolved: res, met: m, rate: res === 0 ? 0 : m / res }
    }),
  }
}
