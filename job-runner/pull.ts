import { formatInTimeZone } from 'date-fns-tz'
import { startOfMonth, endOfMonth, subMonths, format, eachDayOfInterval } from 'date-fns'
import { getDomainCdrs, getQueueStats, getQueueSplits } from '@/lib/versature/endpoints'
import { buildLogicalCalls } from '@/lib/versature/logical-calls'
import { ENGLISH_QUEUE_ID, FRENCH_QUEUE_ID, AI_OVERFLOW_QUEUE_IDS } from '@/lib/versature/queues'
import { getDashboardData } from '@/lib/kpis/get-dashboard-data'
import { syncDay } from '@/lib/versature/sync'
import { getPool } from './db'
import { upsertCDRBatch, upsertQueueStats, upsertKPISnapshot, type QueueStatsRow } from './upsert'

const TZ = 'America/Toronto'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function parseMonth(month: string): { startDate: string; endDate: string } {
  const [year, mo] = month.split('-').map(Number)
  const start = startOfMonth(new Date(year, mo - 1, 1))
  const end = endOfMonth(start)
  return {
    startDate: format(start, 'yyyy-MM-dd'),
    endDate: format(end, 'yyyy-MM-dd'),
  }
}

function getPreviousMonth(): string {
  const now = new Date()
  const prev = subMonths(now, 1)
  return formatInTimeZone(startOfMonth(prev), TZ, 'yyyy-MM')
}

export interface PullResult {
  status: 'already_pulled' | 'in_progress' | 'completed' | 'failed'
  pulledAt?: string
  startedAt?: string
  duration?: string
  recordCounts?: { cdrs: number; queueStats: number; tickets: number }
  error?: string
}

export async function runMonthlyPull(targetMonth?: string): Promise<PullResult> {
  const month = targetMonth ?? getPreviousMonth()
  const { startDate, endDate } = parseMonth(month)
  const pool = getPool()

  // Check existing pull_log
  const existing = await pool.query(
    'SELECT status, started_at, completed_at, record_counts FROM monthly_pull_log WHERE month = $1',
    [month],
  )

  if (existing.rows.length > 0) {
    const row = existing.rows[0]
    if (row.status === 'in_progress') {
      return { status: 'in_progress', startedAt: new Date(row.started_at).toISOString() }
    }
    if (row.status === 'completed') {
      return {
        status: 'already_pulled',
        pulledAt: new Date(row.completed_at).toISOString(),
        recordCounts: row.record_counts,
      }
    }
    // 'failed' → fall through and retry
  }

  // Mark in_progress
  await pool.query(
    `INSERT INTO monthly_pull_log (month, status, started_at)
     VALUES ($1, 'in_progress', NOW())
     ON CONFLICT (month) DO UPDATE
     SET status = 'in_progress', started_at = NOW(), error = NULL, completed_at = NULL`,
    [month],
  )

  const jobStart = Date.now()

  try {
    console.log(`[pull] Starting monthly pull for ${month} (${startDate} → ${endDate})`)

    // === FETCH CDRs ===
    // Pull day-by-day to stay under rate limits
    const allCdrs: Awaited<ReturnType<typeof getDomainCdrs>> = []
    const days = eachDayOfInterval({
      start: new Date(`${startDate}T12:00:00`),
      end: new Date(`${endDate}T12:00:00`),
    })

    for (const day of days) {
      const dayStr = format(day, 'yyyy-MM-dd')
      console.log(`[pull] Fetching CDRs for ${dayStr}…`)
      const dayCdrs = await getDomainCdrs(dayStr, dayStr)
      allCdrs.push(...dayCdrs)
      console.log(`[pull]   → ${dayCdrs.length} CDRs`)
      // Pace between days to avoid rate limits
      await sleep(3000)
    }

    // Upsert CDRs into monthly table
    console.log(`[pull] Upserting ${allCdrs.length} CDRs…`)
    await upsertCDRBatch(allCdrs, month)

    // === FETCH QUEUE STATS ===
    const queueIds = [ENGLISH_QUEUE_ID, FRENCH_QUEUE_ID, ...AI_OVERFLOW_QUEUE_IDS]
    let queueStatsCount = 0

    for (const qid of queueIds) {
      console.log(`[pull] Fetching queue stats for ${qid}…`)
      try {
        const stats = await getQueueStats(qid, startDate, endDate) as unknown as QueueStatsRow
        if (stats) {
          await upsertQueueStats(stats, qid, month)
          queueStatsCount++
        }
      } catch (err) {
        console.warn(`[pull] Queue stats failed for ${qid}:`, err)
      }
      await sleep(500)
    }

    // === SYNC INTO PART 1 TABLES (for KPI computation) ===
    // Sync each day into cdr_segments, queue_stats_daily, logical_calls, queue_splits
    // so that getDashboardData can query them
    console.log(`[pull] Syncing into Part 1 tables for KPI computation…`)
    for (const day of days) {
      try {
        await syncDay(day)
      } catch (err) {
        console.warn(`[pull] syncDay failed for ${format(day, 'yyyy-MM-dd')}:`, err)
      }
      await sleep(3000)
    }

    // === COMPUTE KPI SNAPSHOT ===
    console.log(`[pull] Computing KPI snapshot…`)
    const period = {
      start: new Date(`${startDate}T00:00:00-04:00`),
      end: new Date(`${endDate}T23:59:59-04:00`),
    }
    const kpiData = await getDashboardData(period, { includeWeekends: false })

    await upsertKPISnapshot(month, {
      ...kpiData,
      dataSource: 'historical',
      lastUpdated: new Date().toISOString(),
    })

    const recordCounts = {
      cdrs: allCdrs.length,
      queueStats: queueStatsCount,
      tickets: 0, // ConnectWise not yet integrated
    }

    const durationMs = Date.now() - jobStart
    const duration = `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`

    await pool.query(
      `UPDATE monthly_pull_log
       SET status = 'completed', completed_at = NOW(), record_counts = $2
       WHERE month = $1`,
      [month, JSON.stringify(recordCounts)],
    )

    console.log(`[pull] Completed in ${duration}: ${JSON.stringify(recordCounts)}`)
    return { status: 'completed', pulledAt: new Date().toISOString(), duration, recordCounts }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error(`[pull] Failed for ${month}:`, error)
    await pool.query(
      'UPDATE monthly_pull_log SET status = $2, error = $3 WHERE month = $1',
      [month, 'failed', error],
    )
    return { status: 'failed', error }
  }
}
