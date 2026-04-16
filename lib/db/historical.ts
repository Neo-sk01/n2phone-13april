import { formatInTimeZone } from 'date-fns-tz'
import { endOfMonth } from 'date-fns'
import { getPool } from './client'

const TZ = 'America/Toronto'

export type AiHealthStatus = 'complete' | 'degraded' | 'unknown'

/**
 * Returns 'YYYY-MM' if startDate..endDate covers exactly one complete past
 * calendar month AND pull_log shows 'completed' for that month.
 * Returns null for partial months, the current month, or unfinished pulls.
 */
export async function detectHistoricalMonth(
  startDate: string,
  endDate: string,
): Promise<string | null> {
  // Must start on the 1st (accepts yyyy-MM-dd or yyyy-MM-ddTHH:mm:ss)
  const startMatch = startDate.match(/^(\d{4}-\d{2})-01/)
  if (!startMatch) return null

  const month = startMatch[1]
  const [year, mo] = month.split('-').map(Number)

  // Compute expected last day of month
  const monthEnd = endOfMonth(new Date(year, mo - 1, 1))
  const dd = String(monthEnd.getDate()).padStart(2, '0')

  // endDate must be the last day of the same month
  if (!endDate.startsWith(`${month}-${dd}`)) return null

  // Must be strictly before the current Eastern month
  const currentMonth = formatInTimeZone(new Date(), TZ, 'yyyy-MM')
  if (month >= currentMonth) return null

  // Check pull_log for a completed pull
  const result = await getPool().query(
    `SELECT 1 FROM monthly_pull_log WHERE month = $1 AND status = 'completed' LIMIT 1`,
    [month],
  )

  return result.rows.length > 0 ? month : null
}

/**
 * Validates a `YYYY-MM` string and confirms it is a past Toronto month.
 * Returns the month string if valid, null otherwise.
 *
 * Unlike detectHistoricalMonth this does NOT check the pull_log — callers
 * use this to validate a URL param before consulting snapshots. The `now`
 * param exists so tests can pin the comparison boundary.
 */
export function resolveHistoricalMonth(raw: string, now: Date = new Date()): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return null
  const currentMonth = formatInTimeZone(now, TZ, 'yyyy-MM')
  if (raw >= currentMonth) return null
  return raw
}

/** Returns the pre-computed KPI payload for a completed month, or null. */
export async function readKPISnapshot(month: string): Promise<Record<string, unknown> | null> {
  const result = await getPool().query(
    'SELECT kpis FROM monthly_kpi_snapshots WHERE month = $1',
    [month],
  )

  if (result.rows.length === 0) return null
  return result.rows[0].kpis
}

/**
 * Returns the snapshot KPIs together with the authoritative ai_health_status
 * from monthly_pull_log. The DB column is the source of truth; snapshot JSON
 * may carry a stale or absent aiHealthStatus for legacy rows written before
 * migration 006 / commit 4e499ab.
 */
export async function readKPISnapshotWithHealth(month: string): Promise<{
  kpis: Record<string, unknown>
  aiHealthStatus: AiHealthStatus
} | null> {
  const result = await getPool().query(
    `SELECT s.kpis, l.ai_health_status
       FROM monthly_kpi_snapshots s
       LEFT JOIN monthly_pull_log l ON l.month = s.month
      WHERE s.month = $1`,
    [month],
  )

  if (result.rows.length === 0) return null
  const row = result.rows[0]
  const status = (row.ai_health_status as AiHealthStatus | null) ?? 'unknown'
  return {
    kpis: row.kpis,
    aiHealthStatus: status,
  }
}
