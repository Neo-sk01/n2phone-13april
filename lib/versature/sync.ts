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

    const period = {
      start: new Date(`${dateKey}T00:00:00-04:00`),
      end: new Date(`${dateKey}T23:59:59-04:00`),
    }

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
