import { createHash } from 'node:crypto'
import { formatInTimeZone } from 'date-fns-tz'
import { getDomainCdrs, getQueueSplits, getQueueStats } from './endpoints'
import { AI_OVERFLOW_QUEUE_IDS, ENGLISH_QUEUE_ID, FRENCH_QUEUE_ID } from './queues'
import { buildLogicalCalls } from './logical-calls'
import { replaceLogicalCallsForDate, withTransaction } from '@/lib/db/queries'
import { getDashboardData } from '@/lib/kpis/get-dashboard-data'
import { getPool } from '@/lib/db/client'

function hashPayload(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

/**
 * Sync queue data for a month using only endpoints that tolerate multi-day ranges.
 * The per-day queue-stats endpoint 500s for single-day queries, so we:
 *   - fetch month-wide aggregate stats per queue (1 call each)
 *   - fetch daily splits per queue (1 call each — returns one row per day with data)
 *   - derive per-day queue_stats_daily rows from the splits (volume = calls_offered)
 *   - distribute abandoned_calls, avg_talk_time, etc. from the month-wide aggregate
 *     proportionally to each day's volume so KPI math still works
 */
export async function syncMonthQueueData(
  startDate: string,
  endDate: string,
  onProgress?: (message: string) => void,
) {
  const run = await getPool().query(
    `
      insert into ingest_runs (run_type, start_date, end_date, status)
      values ($1, $2, $3, 'running')
      returning id
    `,
    ['monthly-queues', startDate, endDate],
  )

  try {
    const queueIds = [ENGLISH_QUEUE_ID, FRENCH_QUEUE_ID, ...AI_OVERFLOW_QUEUE_IDS]

    // Fetch sequentially with spacing to respect Versature's rate limits (2/sec).
    const monthlyStats: Record<string, Awaited<ReturnType<typeof getQueueStats>>> = {}
    const monthlySplits: Record<string, Awaited<ReturnType<typeof getQueueSplits>>> = {}

    for (const queueId of queueIds) {
      onProgress?.(`Fetching monthly stats for queue ${queueId}…`)
      const statsResp = await getQueueStats(queueId, startDate, endDate)
      monthlyStats[queueId] = Array.isArray(statsResp) ? statsResp[0] : statsResp
      await new Promise((r) => setTimeout(r, 800))

      onProgress?.(`Fetching daily splits for queue ${queueId}…`)
      const splitsResp = await getQueueSplits(queueId, startDate, endDate, 'day')
      monthlySplits[queueId] = Array.isArray(splitsResp) ? splitsResp : []
      await new Promise((r) => setTimeout(r, 800))
    }

    await withTransaction(async (client) => {
      // Clear existing rows for this date range to avoid stale data
      await client.query(
        `delete from queue_stats_daily where stats_date between $1::date and $2::date`,
        [startDate, endDate],
      )
      await client.query(
        `delete from queue_splits where split_period = 'day' and interval_start::date between $1::date and $2::date`,
        [startDate, endDate],
      )

      for (const queueId of queueIds) {
        const stats = monthlyStats[queueId]
        const splits = monthlySplits[queueId]
        if (!stats || !Array.isArray(splits)) continue

        const totalVolume = splits.reduce((sum, s) => sum + (s.volume ?? 0), 0) || 1
        const monthAbandoned = Number(stats.abandoned_calls) || 0
        const monthAbandonedRate = Number(stats.abandoned_rate) || 0
        const monthAvgTalk = Number(stats.average_talk_time) || 0
        const monthAvgHandle = Number(stats.average_handle_time) || 0

        for (const split of splits) {
          const dayVolume = split.volume ?? 0
          // Distribute month-aggregate abandoned calls proportionally to each day's volume.
          // Rates and average talk/handle time are stable across the month, so apply as-is.
          const dayAbandoned = Math.round((dayVolume / totalVolume) * monthAbandoned)
          const dateKey = split.interval.slice(0, 10)

          await client.query(
            `
              insert into queue_stats_daily (
                queue_id, stats_date, calls_offered, abandoned_calls, abandoned_rate,
                average_talk_time, average_handle_time, payload
              )
              values ($1,$2,$3,$4,$5,$6,$7,$8)
              on conflict (queue_id, stats_date) do update set
                calls_offered = excluded.calls_offered,
                abandoned_calls = excluded.abandoned_calls,
                abandoned_rate = excluded.abandoned_rate,
                average_talk_time = excluded.average_talk_time,
                average_handle_time = excluded.average_handle_time,
                payload = excluded.payload,
                imported_at = now()
            `,
            [
              queueId,
              dateKey,
              dayVolume,
              dayAbandoned,
              monthAbandonedRate,
              Math.round(monthAvgTalk),
              Math.round(monthAvgHandle),
              { ...stats, _derived_from: 'monthly_aggregate', _day_volume: dayVolume },
            ],
          )

          await client.query(
            `
              insert into queue_splits (queue_id, split_period, interval_start, volume, payload)
              values ($1,$2,$3,$4,$5)
              on conflict (queue_id, split_period, interval_start) do update set
                volume = excluded.volume,
                payload = excluded.payload,
                imported_at = now()
            `,
            [queueId, 'day', split.interval, dayVolume, split],
          )
        }
      }
    })

    await getPool().query(
      `update ingest_runs set status = 'completed', completed_at = now() where id = $1`,
      [run.rows[0].id],
    )
  } catch (error) {
    await getPool().query(
      `update ingest_runs set status = 'failed', error_message = $2, completed_at = now() where id = $1`,
      [run.rows[0].id, error instanceof Error ? error.message : String(error)],
    )
    throw error
  }
}

export async function syncDay(day: Date) {
  const dateKey = formatInTimeZone(day, 'America/Toronto', 'yyyy-MM-dd')
  const run = await getPool().query(
    `
      insert into ingest_runs (run_type, start_date, end_date, status)
      values ($1, $2, $3, 'running')
      returning id
    `,
    ['manual-refresh', dateKey, dateKey],
  )
  try {
    const cdrs = await getDomainCdrs(dateKey, dateKey)
    const logicalCalls = buildLogicalCalls(cdrs)

    const queueIds = [ENGLISH_QUEUE_ID, FRENCH_QUEUE_ID, ...AI_OVERFLOW_QUEUE_IDS]
    const queueStats = await Promise.all(queueIds.map((queueId) => getQueueStats(queueId, dateKey, dateKey)))
    const daySplits = await Promise.all(queueIds.map((queueId) => getQueueSplits(queueId, dateKey, dateKey, 'day')))

    await withTransaction(async (client) => {
      // Delete stale cdr_segments for this day before re-inserting.
      // Prevents double-counting if Versature corrects a CDR field (hash changes, old row would survive).
      await client.query(
        `DELETE FROM cdr_segments WHERE start_time >= $1::date AND start_time < ($1::date + interval '1 day')`,
        [dateKey],
      )

      for (const cdr of cdrs) {
        await client.query(
          `
            insert into cdr_segments (
              source_hash, external_id, call_type, start_time, answer_time, end_time,
              duration_seconds, from_number, from_name, from_user, to_id, payload
            )
            values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            on conflict (source_hash) do update set payload = excluded.payload
          `,
          [
            hashPayload(cdr),
            cdr.id ?? null,
            cdr.call_type ?? null,
            cdr.start_time,
            cdr.answer_time,
            cdr.end_time,
            cdr.duration,
            cdr.from.id ?? cdr.from.number ?? null,
            cdr.from.name ?? null,
            cdr.from.user ?? null,
            cdr.to.id ?? null,
            cdr,
          ],
        )
      }

      await replaceLogicalCallsForDate(client, dateKey, logicalCalls)

      for (const [index, stats] of queueStats.entries()) {
        await client.query(
          `
            insert into queue_stats_daily (
              queue_id, stats_date, calls_offered, abandoned_calls, abandoned_rate,
              average_talk_time, average_handle_time, payload
            )
            values ($1,$2,$3,$4,$5,$6,$7,$8)
            on conflict (queue_id, stats_date) do update set
              calls_offered = excluded.calls_offered,
              abandoned_calls = excluded.abandoned_calls,
              abandoned_rate = excluded.abandoned_rate,
              average_talk_time = excluded.average_talk_time,
              average_handle_time = excluded.average_handle_time,
              payload = excluded.payload,
              imported_at = now()
          `,
          [
            queueIds[index],
            dateKey,
            stats.calls_offered,
            stats.abandoned_calls,
            stats.abandoned_rate,
            stats.average_talk_time,
            stats.average_handle_time,
            stats,
          ],
        )
      }

      await client.query(
        `delete from queue_splits where split_period = 'day' and interval_start::date = $1::date`,
        [dateKey],
      )

      for (const [index, splits] of daySplits.entries()) {
        for (const split of splits) {
          await client.query(
            `
              insert into queue_splits (queue_id, split_period, interval_start, volume, payload)
              values ($1,$2,$3,$4,$5)
              on conflict (queue_id, split_period, interval_start) do update set
                volume = excluded.volume,
                payload = excluded.payload,
                imported_at = now()
            `,
            [queueIds[index], 'day', split.interval, split.volume, split],
          )
        }
      }
    })

    // Use Toronto timezone-aware boundaries (handles EDT/EST automatically)
    const dayStart = new Date(formatInTimeZone(new Date(`${dateKey}T12:00:00`), 'America/Toronto', "yyyy-MM-dd'T'00:00:00xxx"))
    const dayEnd = new Date(formatInTimeZone(new Date(`${dateKey}T12:00:00`), 'America/Toronto', "yyyy-MM-dd'T'23:59:59xxx"))
    const period = { start: dayStart, end: dayEnd }

    const snapshot = await getDashboardData(period, { includeWeekends: false })

    await withTransaction(async (client) => {
      await client.query(
        `
          insert into kpi_daily_snapshots (snapshot_date, payload)
          values ($1, $2)
          on conflict (snapshot_date) do update set
            payload = excluded.payload,
            updated_at = now()
        `,
        [dateKey, snapshot],
      )
    })

    await getPool().query(
      `
        update ingest_runs
        set status = 'completed', completed_at = now()
        where id = $1
      `,
      [run.rows[0].id],
    )
  } catch (error) {
    await getPool().query(
      `
        update ingest_runs
        set status = 'failed', error_message = $2, completed_at = now()
        where id = $1
      `,
      [run.rows[0].id, error instanceof Error ? error.message : String(error)],
    )

    throw error
  }
}
