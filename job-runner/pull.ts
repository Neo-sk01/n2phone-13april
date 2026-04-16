import { formatInTimeZone } from 'date-fns-tz'
import { startOfMonth, endOfMonth, subMonths, format, eachDayOfInterval } from 'date-fns'
import { getQueueStats } from '@/lib/versature/endpoints'
import { ENGLISH_QUEUE_ID, FRENCH_QUEUE_ID, AI_OVERFLOW_QUEUE_IDS } from '@/lib/versature/queues'
import { getDashboardData } from '@/lib/kpis/get-dashboard-data'
import { syncMonthQueueData } from '@/lib/versature/sync'
import { getPool } from './db'
import { fetchTickets } from '@/lib/connectwise/client'
import { getCdrsForUsers } from '@/lib/versature/cdrs-users'
import { runMonthlyCorrelation } from '@/lib/connectwise/runner'
import { computeAiHealthStatus, stripAiHealthKpis } from './ai-health-status'
import {
  upsertQueueStats,
  upsertTicketBatch,
  upsertAiCandidateCalls,
  upsertKPISnapshot,
  upsertBhKpiSnapshot,
  type QueueStatsRow,
} from './upsert'

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
  recordCounts?: { cdrs: number; queueStats: number; tickets: number; correlations?: number }
  aiHealthStatus?: 'complete' | 'degraded' | 'unknown'
  error?: string
}

export async function runMonthlyPull(targetMonth?: string): Promise<PullResult> {
  const month = targetMonth ?? getPreviousMonth()
  const { startDate, endDate } = parseMonth(month)
  const pool = getPool()

  // Check existing pull_log
  const existing = await pool.query(
    `SELECT status, started_at, completed_at, record_counts, ai_health_status
       FROM monthly_pull_log
      WHERE month = $1`,
    [month],
  )

  if (existing.rows.length > 0) {
    const row = existing.rows[0]
    if (row.status === 'in_progress') {
      return { status: 'in_progress', startedAt: new Date(row.started_at).toISOString() }
    }
    // Only short-circuit when the previous pull was FULLY successful. A month
    // marked `completed` but with ai_health_status != 'complete' is a partial
    // success — Part 1 KPIs are valid but AI-health stages failed and their
    // KPIs were stripped from the snapshot. Allow rerun so operators can
    // recover from transient ConnectWise / CDR / correlation failures.
    if (row.status === 'completed' && row.ai_health_status === 'complete') {
      return {
        status: 'already_pulled',
        pulledAt: new Date(row.completed_at).toISOString(),
        recordCounts: row.record_counts,
        aiHealthStatus: row.ai_health_status,
      }
    }
    // 'failed' OR ('completed' && degraded/unknown) → fall through and retry
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

    // === FETCH QUEUE STATS (0-10%) ===
    // CDR fetch is skipped — KPIs #1-9 come from queue stats/splits.
    // KPI #10 (hourly avg call length) requires CDRs and is deferred.
    const queueIds = [ENGLISH_QUEUE_ID, FRENCH_QUEUE_ID, ...AI_OVERFLOW_QUEUE_IDS]
    let queueStatsCount = 0

    for (let i = 0; i < queueIds.length; i++) {
      const qid = queueIds[i]
      const pct = Math.round(((i + 1) / queueIds.length) * 10)
      await updateProgress(month, pct, `Fetching queue stats for ${qid}…`, totalDays)

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

    // === FETCH AI-QUEUE CDRS (10-22%) ===
    // Track each AI-health stage so we can mark the month `degraded` if any fails.
    let aiCdrsOk = false
    let ticketsOk = false
    let correlationOk = false

    await updateProgress(month, 12, 'Fetching AI-queue CDRs…')
    console.log(`[pull] Fetching AI-queue CDRs (${AI_OVERFLOW_QUEUE_IDS.join(', ')})…`)
    let aiCalls: Awaited<ReturnType<typeof getCdrsForUsers>> = []
    try {
      aiCalls = await getCdrsForUsers([...AI_OVERFLOW_QUEUE_IDS], startDate, endDate)
      console.log(`[pull]   → ${aiCalls.length} AI-queue calls`)
      if (aiCalls.length > 0) {
        await updateProgress(month, 20, `Upserting ${aiCalls.length} AI candidate calls…`)
        await upsertAiCandidateCalls(aiCalls, month)
      }
      aiCdrsOk = true
    } catch (err) {
      console.warn('[pull] AI CDR fetch failed (degrades AI-health):', err)
    }

    // === FETCH CONNECTWISE TICKETS (22-33%) ===
    let tickets: Awaited<ReturnType<typeof fetchTickets>> = []
    await updateProgress(month, 24, 'Fetching ConnectWise tickets…')
    console.log(`[pull] Fetching ConnectWise tickets…`)

    try {
      tickets = await fetchTickets(startDate, endDate)
      console.log(`[pull]   → ${tickets.length} tickets`)

      if (tickets.length > 0) {
        await updateProgress(month, 30, `Upserting ${tickets.length} tickets…`)
        await upsertTicketBatch(tickets, month)
      }
      ticketsOk = true
    } catch (err) {
      console.warn('[pull] ConnectWise ticket fetch failed (degrades AI-health):', err)
    }

    // === RUN CORRELATION (33-40%) ===
    await updateProgress(month, 34, 'Correlating AI calls to tickets…')
    let correlationResult = { candidates: 0, matched: 0, exact: 0, fuzzy: 0 }
    // Correlation is only meaningful if both upstream stages succeeded.
    if (aiCdrsOk && ticketsOk) {
      try {
        correlationResult = await runMonthlyCorrelation(month)
        console.log(
          `[pull]   → correlated ${correlationResult.matched}/${correlationResult.candidates}` +
            ` (exact ${correlationResult.exact}, fuzzy ${correlationResult.fuzzy})`,
        )
        correlationOk = true
      } catch (err) {
        console.warn('[pull] Correlation failed (degrades AI-health):', err)
      }
    } else {
      console.warn(
        '[pull] Skipping correlation — upstream AI-health stages did not complete' +
          ` (aiCdrsOk=${aiCdrsOk}, ticketsOk=${ticketsOk})`,
      )
    }

    const aiHealthStatus = computeAiHealthStatus({ aiCdrsOk, ticketsOk, correlationOk })
    console.log(`[pull] AI-health status: ${aiHealthStatus}`)

    // === SYNC INTO PART 1 TABLES (25-80%) ===
    // Fetch month-wide daily splits per queue (one request each), then fan them
    // out into queue_splits and queue_stats_daily. The per-day stats endpoint
    // 500s on single-day queries, so we use the month-wide splits to seed
    // queue_stats_daily with per-day volume numbers.
    console.log(`[pull] Fetching month-wide daily splits for KPI computation…`)
    await syncMonthQueueData(startDate, endDate, (msg) => {
      void updateProgress(month, 50, msg, totalDays)
    })

    // === COMPUTE KPI SNAPSHOTS (80-95%) ===
    await updateProgress(month, 82, 'Computing KPI snapshots…')
    console.log(`[pull] Computing KPI snapshots…`)
    const period = {
      start: new Date(`${startDate}T00:00:00`),
      end: new Date(`${endDate}T23:59:59`),
    }

    // Full KPIs. When AI-health is degraded, strip kpi11..kpi14 so historical
    // readers see them as missing rather than frozen zeros.
    const kpiData = await getDashboardData(period, { includeWeekends: false })
    const kpiPayload = {
      ...kpiData,
      dataSource: 'historical' as const,
      aiHealthStatus,
      lastUpdated: new Date().toISOString(),
    }
    await upsertKPISnapshot(
      month,
      aiHealthStatus === 'complete' ? kpiPayload : stripAiHealthKpis(kpiPayload),
    )

    // Business-hours KPIs (weekdays only)
    await updateProgress(month, 90, 'Computing business-hours KPI snapshot…')
    const bhKpiData = await getDashboardData(period, { includeWeekends: false })
    const bhKpiPayload = {
      ...bhKpiData,
      dataSource: 'historical' as const,
      aiHealthStatus,
      lastUpdated: new Date().toISOString(),
    }
    await upsertBhKpiSnapshot(
      month,
      aiHealthStatus === 'complete' ? bhKpiPayload : stripAiHealthKpis(bhKpiPayload),
    )

    // === FINALIZE (95-100%) ===
    await updateProgress(month, 95, 'Finalizing…')

    const recordCounts = {
      cdrs: aiCalls.length,
      queueStats: queueStatsCount,
      tickets: tickets.length,
      correlations: correlationResult.matched,
    }

    const durationMs = Date.now() - jobStart
    const duration = `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`

    await pool.query(
      `UPDATE monthly_pull_log
       SET status = 'completed',
           completed_at = NOW(),
           record_counts = $2,
           ai_health_status = $3,
           progress_pct = 100,
           progress_message = $4
       WHERE month = $1`,
      [
        month,
        JSON.stringify(recordCounts),
        aiHealthStatus,
        aiHealthStatus === 'complete' ? 'Complete' : 'Complete (AI-health degraded)',
      ],
    )

    console.log(
      `[pull] Completed in ${duration} (aiHealth=${aiHealthStatus}): ${JSON.stringify(recordCounts)}`,
    )
    return {
      status: 'completed',
      pulledAt: new Date().toISOString(),
      duration,
      recordCounts,
      aiHealthStatus,
    }
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
