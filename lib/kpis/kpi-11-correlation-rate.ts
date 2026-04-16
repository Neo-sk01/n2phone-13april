import { getPool } from '@/lib/db/client'

export async function computeKpi11(period: { start: Date; end: Date }) {
  const pool = getPool()
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int                                             AS candidates,
       COUNT(c.ticket_id)::int                                   AS matched,
       COUNT(*) FILTER (WHERE c.confidence = 'exact')::int       AS exact,
       COUNT(*) FILTER (WHERE c.confidence = 'fuzzy')::int       AS fuzzy
       FROM ai_candidate_calls a
  LEFT JOIN connectwise_correlations c
         ON c.cdr_id = a.cdr_id AND c.month = a.month
      WHERE a.start_time >= $1 AND a.start_time <= $2`,
    [period.start, period.end],
  )
  const r = rows[0] ?? { candidates: 0, matched: 0, exact: 0, fuzzy: 0 }
  const candidates = Number(r.candidates)
  const matched = Number(r.matched)
  return {
    candidates,
    matched,
    exact: Number(r.exact),
    fuzzy: Number(r.fuzzy),
    rate: candidates === 0 ? 0 : matched / candidates,
  }
}
