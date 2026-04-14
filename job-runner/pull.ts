import { formatInTimeZone } from 'date-fns-tz'
import { startOfMonth, endOfMonth, subMonths, format, eachDayOfInterval } from 'date-fns'
import { getDomainCdrs, getQueueStats } from '@/lib/versature/endpoints'
import { ENGLISH_QUEUE_ID, FRENCH_QUEUE_ID, AI_OVERFLOW_QUEUE_IDS } from '@/lib/versature/queues'
import { getDashboardData } from '@/lib/kpis/get-dashboard-data'
import { syncDay } from '@/lib/versature/sync'
import { getPool } from './db'
import { fetchTickets } from '@/lib/connectwise/client'
import { upsertCDRBatch, upsertQueueStats, upsertTicketBatch, upsertKPISnapshot, upsertBhKpiSnapshot, type QueueStatsRow } from './upsert'

const TZ = 'America/Toronto'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function updateProgress(
  month: string,
  pct: number,
  message: string,
  totalPages?: number,
): Promise<void> {
  const pool = getPool()
  await pool.query(
    `UPDATE monthly_pull_log
     SET progress_pct = $2, progress_message = $3, total_pages = $4
     WHERE month = $1`,
    [month, pct, message, totalPages ?? null],
  )
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

  // Atomic CAS: only transition to in_progress if not already in_progress.
  // Prevents two concurrent requests from both running the full pull.
  const cas = await pool.query(
    `INSERT INTO monthly_pull_log (month, status, started_at)
     VALUES ($1, 'in_progress', NOW())
     ON CONFLICT (month) DO UPDATE
     SET status = 'in_progress', started_at = NOW(), error = NULL, completed_at = NULL
     WHERE monthly_pull_log.status != 'in_progress'
     RETURNING id`,
    [month],
  )

  if (cas.rows.length === 0) {
    return { status: 'in_progress' }
  }

  const jobStart = Date.now()

  try {
    console.log(`[pull] Starting monthly pull for ${month} (${startDate} → ${endDate})`)
    const days = eachDayOfInterval({
      start: new Date(`${startDate}T12:00:00`),
      end: new Date(`${endDate}T12:00:00`),
    })
    const totalDays = days.length

    // === FETCH CDRs (0-30%) ===
    const allCdrs: Awaited<ReturnType<typeof getDomainCdrs>> = []

    for (let i = 0; i < days.length; i++) {
      const dayStr = format(days[i], 'yyyy-MM-dd')
      const pct = Math.round((i / totalDays) * 30)
      await updateProgress(month, pct, `Fetching CDRs for ${dayStr}…`, totalDays)

      console.log(`[pull] Fetching CDRs for ${dayStr}…`)
      const dayCdrs = await getDomainCdrs(dayStr, dayStr)
      allCdrs.push(...dayCdrs)
      console.log(`[pull]   → ${dayCdrs.length} CDRs`)
      await sleep(3000)
    }

    console.log(`[pull] Upserting ${allCdrs.length} CDRs…`)
    await updateProgress(month, 30, `Upserting ${allCdrs.length} CDRs…`)
    await upsertCDRBatch(allCdrs, month)

    // === FETCH QUEUE STATS (30-40%) ===
    const queueIds = [ENGLISH_QUEUE_ID, FRENCH_QUEUE_ID, ...AI_OVERFLOW_QUEUE_IDS]
    let queueStatsCount = 0

    for (let i = 0; i < queueIds.length; i++) {
      const qid = queueIds[i]
      const pct = 30 + Math.round(((i + 1) / queueIds.length) * 10)
      await updateProgress(month, pct, `Fetching queue stats for ${qid}…`)

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

    // === FETCH CONNECTWISE TICKETS (40-55%) ===
    let tickets: Awaited<ReturnType<typeof fetchTickets>> = []
    await updateProgress(month, 42, 'Fetching ConnectWise tickets…')
    console.log(`[pull] Fetching ConnectWise tickets…`)

    try {
      tickets = await fetchTickets(startDate, endDate)
      console.log(`[pull]   → ${tickets.length} tickets`)

      if (tickets.length > 0) {
        await updateProgress(month, 50, `Upserting ${tickets.length} tickets…`)
        await upsertTicketBatch(tickets, month)
      }
    } catch (err) {
      // ConnectWise failure is non-fatal — log and continue
      console.warn('[pull] ConnectWise ticket fetch failed (non-fatal):', err)
    }

    await updateProgress(month, 55, 'Syncing into Part 1 tables…')

    // === SYNC INTO PART 1 TABLES (55-80%) ===
    console.log(`[pull] Syncing into Part 1 tables for KPI computation…`)
    const failedDays: string[] = []
    for (let i = 0; i < days.length; i++) {
      const dayStr = format(days[i], 'yyyy-MM-dd')
      const pct = 55 + Math.round(((i + 1) / totalDays) * 25)
      await updateProgress(month, pct, `Syncing ${dayStr}…`)

      try {
        await syncDay(days[i])
      } catch (err) {
        failedDays.push(dayStr)
        console.warn(`[pull] syncDay failed for ${dayStr}:`, err)
      }
      await sleep(3000)
    }

    if (failedDays.length > 0) {
      throw new Error(`syncDay failed for ${failedDays.length} day(s): ${failedDays.join(', ')}`)
    }

    // === COMPUTE KPI SNAPSHOTS (80-95%) ===
    await updateProgress(month, 82, 'Computing KPI snapshots…')
    console.log(`[pull] Computing KPI snapshots…`)
    const period = {
      start: new Date(`${startDate}T00:00:00`),
      end: new Date(`${endDate}T23:59:59`),
    }

    // Full KPIs
    const kpiData = await getDashboardData(period, { includeWeekends: false })
    await upsertKPISnapshot(month, {
      ...kpiData,
      dataSource: 'historical',
      lastUpdated: new Date().toISOString(),
    })

    // Business-hours KPIs (weekdays only)
    await updateProgress(month, 90, 'Computing business-hours KPI snapshot…')
    const bhKpiData = await getDashboardData(period, { includeWeekends: false })
    await upsertBhKpiSnapshot(month, {
      ...bhKpiData,
      dataSource: 'historical',
      lastUpdated: new Date().toISOString(),
    })

    // === FINALIZE (95-100%) ===
    await updateProgress(month, 95, 'Finalizing…')

    const recordCounts = {
      cdrs: allCdrs.length,
      queueStats: queueStatsCount,
      tickets: tickets.length,
    }

    const durationMs = Date.now() - jobStart
    const duration = `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`

    await pool.query(
      `UPDATE monthly_pull_log
       SET status = 'completed', completed_at = NOW(), record_counts = $2, progress_pct = 100, progress_message = 'Complete'
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
