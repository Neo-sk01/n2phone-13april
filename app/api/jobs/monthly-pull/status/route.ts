import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db/client'
import { formatInTimeZone } from 'date-fns-tz'
import { subMonths, startOfMonth } from 'date-fns'

function getPreviousMonth(): string {
  return formatInTimeZone(
    startOfMonth(subMonths(new Date(), 1)),
    'America/Toronto',
    'yyyy-MM',
  )
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const month = req.nextUrl.searchParams.get('month') ?? getPreviousMonth()

  try {
    const result = await getPool().query(
      `SELECT status, started_at, completed_at, record_counts, error,
              progress_pct, progress_message, total_pages, ai_health_status
         FROM monthly_pull_log
        WHERE month = $1`,
      [month],
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ status: 'not_pulled', month })
    }

    const row = result.rows[0]
    const rc = row.record_counts as
      | { cdrs: number; queueStats: number; tickets: number; correlations?: number }
      | null

    // Mark stale jobs: if in_progress for > 30 minutes, flag as potentially stale
    let stale = false
    if (row.status === 'in_progress' && row.started_at) {
      const elapsed = Date.now() - new Date(row.started_at).getTime()
      stale = elapsed > 30 * 60 * 1000
    }

    return NextResponse.json({
      status: row.status as string,
      month,
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : undefined,
      pulledAt: row.completed_at ? new Date(row.completed_at).toISOString() : undefined,
      recordCounts: rc ?? undefined,
      error: row.error ?? undefined,
      progressPct: row.progress_pct ?? 0,
      progressMessage: row.progress_message ?? undefined,
      totalPages: row.total_pages ?? undefined,
      aiHealthStatus: (row.ai_health_status as 'complete' | 'degraded' | 'unknown' | null) ?? undefined,
      stale,
    })
  } catch {
    return NextResponse.json({ status: 'not_pulled', month })
  }
}
