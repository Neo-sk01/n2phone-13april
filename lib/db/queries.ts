import type { PoolClient } from 'pg'
import { getPool } from './client'
import type { LogicalCallRow } from './schema'

export function buildUpsertQueueStatsStatement() {
  return `
    insert into queue_stats_daily (
      queue_id,
      stats_date,
      calls_offered,
      abandoned_calls,
      abandoned_rate,
      average_talk_time,
      average_handle_time,
      payload
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8)
    on conflict (queue_id, stats_date) do update set
      calls_offered = excluded.calls_offered,
      abandoned_calls = excluded.abandoned_calls,
      abandoned_rate = excluded.abandoned_rate,
      average_talk_time = excluded.average_talk_time,
      average_handle_time = excluded.average_handle_time,
      payload = excluded.payload,
      imported_at = now()
  `
}

export async function replaceLogicalCallsForDate(
  client: PoolClient,
  callDate: string,
  rows: LogicalCallRow[],
) {
  await client.query('delete from logical_calls where call_date = $1', [callDate])

  for (const row of rows) {
    await client.query(
      `
        insert into logical_calls (
          call_date, dedupe_key, caller_number, dnis, start_time, end_time,
          answered, duration_seconds, representative_hash, payload
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        on conflict (call_date, dedupe_key) do update set
          caller_number = excluded.caller_number,
          dnis = excluded.dnis,
          start_time = excluded.start_time,
          end_time = excluded.end_time,
          answered = excluded.answered,
          duration_seconds = excluded.duration_seconds,
          representative_hash = excluded.representative_hash,
          payload = excluded.payload,
          imported_at = now()
      `,
      [
        row.callDate,
        row.dedupeKey,
        row.callerNumber,
        row.dnis,
        row.startTime,
        row.endTime,
        row.answered,
        row.durationSeconds,
        row.representativeHash,
        row.payload,
      ],
    )
  }
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect()
  try {
    await client.query('begin')
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

// --- KPI #1 queries ---

export async function getLogicalCallCountForPeriod(
  period: { start: Date; end: Date },
  options: { includeWeekends?: boolean } = {},
) {
  const result = await getPool().query(
    `
      select count(*)::int as count
      from logical_calls
      where start_time >= $1 and start_time <= $2
        and ($3::boolean or extract(isodow from start_time at time zone 'America/Toronto') between 1 and 5)
    `,
    [period.start.toISOString(), period.end.toISOString(), options.includeWeekends ?? false],
  )

  return result.rows[0]?.count ?? 0
}

export async function getCallsOfferedForQueues(
  period: { start: Date; end: Date },
  queueIds: string[],
  options: { includeWeekends?: boolean } = {},
) {
  // stats_date is stored as the Toronto business date requested from Versature.
  const result = await getPool().query(
    `
      select coalesce(sum(calls_offered), 0)::int as count
      from queue_stats_daily
      where stats_date between $1::date and $2::date
        and queue_id = any($3::text[])
        and ($4::boolean or extract(isodow from stats_date) between 1 and 5)
    `,
    [
      period.start.toISOString().slice(0, 10),
      period.end.toISOString().slice(0, 10),
      queueIds,
      options.includeWeekends ?? false,
    ],
  )

  return result.rows[0]?.count ?? 0
}

// --- KPI #2 queries ---

export async function getAbandonedCallsForQueues(
  period: { start: Date; end: Date },
  queueIds: string[],
  options: { includeWeekends?: boolean } = {},
) {
  // stats_date is stored as the Toronto business date requested from Versature.
  const result = await getPool().query(
    `
      select coalesce(sum(abandoned_calls), 0)::int as count
      from queue_stats_daily
      where stats_date between $1::date and $2::date
        and queue_id = any($3::text[])
        and ($4::boolean or extract(isodow from stats_date) between 1 and 5)
    `,
    [
      period.start.toISOString().slice(0, 10),
      period.end.toISOString().slice(0, 10),
      queueIds,
      options.includeWeekends ?? false,
    ],
  )

  return result.rows[0]?.count ?? 0
}

// --- Short Calls query ---

export async function getShortAnsweredCallCount(
  period: { start: Date; end: Date },
  thresholdSeconds: number,
  options: { includeWeekends?: boolean } = {},
) {
  const result = await getPool().query(
    `
      select count(*)::int as count
      from cdr_segments
      where start_time >= $1
        and start_time <= $2
        and answer_time is not null
        and duration_seconds < $3
        and to_id = any($4::text[])
        and ($5::boolean or extract(isodow from start_time at time zone 'America/Toronto') between 1 and 5)
    `,
    [
      period.start.toISOString(),
      period.end.toISOString(),
      thresholdSeconds,
      [process.env.DNIS_PRIMARY!, process.env.DNIS_SECONDARY!],
      options.includeWeekends ?? false,
    ],
  )

  return result.rows[0]?.count ?? 0
}

// --- KPI #8 queries ---

export async function getAverageTalkTimes(
  period: { start: Date; end: Date },
  options: { includeWeekends?: boolean } = {},
) {
  // stats_date is stored as the Toronto business date requested from Versature.
  const result = await getPool().query(
    `
      select queue_id, round(avg(average_talk_time))::int as average_seconds
      from queue_stats_daily
      where stats_date between $1::date and $2::date
        and ($3::boolean or extract(isodow from stats_date) between 1 and 5)
      group by queue_id
      order by queue_id
    `,
    [
      period.start.toISOString().slice(0, 10),
      period.end.toISOString().slice(0, 10),
      options.includeWeekends ?? false,
    ],
  )

  return result.rows
}

// --- KPI #9 queries ---

export async function getWeekdaySplitRowsForPeriod(
  period: { start: Date; end: Date },
  options: { includeWeekends?: boolean } = {},
) {
  // Aggregate volume across all queues per calendar date first,
  // then return one row per date with the total volume and weekday label.
  // This ensures KPI #9 averages "total calls per day-of-week", not "per queue-row".
  const result = await getPool().query(
    `
      select weekday, volume from (
        select (interval_start at time zone 'America/Toronto')::date as cal_date,
               to_char(interval_start at time zone 'America/Toronto', 'Dy') as weekday,
               sum(volume) as volume
        from queue_splits
        where split_period = 'day'
          and interval_start >= $1
          and interval_start <= $2
          and ($3::boolean or extract(isodow from interval_start at time zone 'America/Toronto') between 1 and 5)
        group by cal_date, to_char(interval_start at time zone 'America/Toronto', 'Dy')
      ) daily
    `,
    [period.start.toISOString(), period.end.toISOString(), options.includeWeekends ?? false],
  )

  return result.rows
}

// --- KPI #10 queries ---

export async function getAverageAnsweredDurationByHour(
  period: { start: Date; end: Date },
  options: { includeWeekends?: boolean } = {},
) {
  const result = await getPool().query(
    `
      select extract(hour from start_time at time zone 'America/Toronto')::int as hour,
             round(avg(duration_seconds))::int as average_seconds
      from cdr_segments
      where start_time >= $1
        and start_time <= $2
        and answer_time is not null
        and to_id = any($3::text[])
        and ($4::boolean or extract(isodow from start_time at time zone 'America/Toronto') between 1 and 5)
        and extract(hour from start_time at time zone 'America/Toronto') between 8 and 18
      group by hour
      order by hour
    `,
    [
      period.start.toISOString(),
      period.end.toISOString(),
      [process.env.DNIS_PRIMARY!, process.env.DNIS_SECONDARY!],
      options.includeWeekends ?? false,
    ],
  )

  return result.rows
}

// --- Dashboard metadata ---

export async function getLastSuccessfulIngestAt() {
  const result = await getPool().query(
    `
      select completed_at
      from ingest_runs
      where status = 'completed'
      order by completed_at desc
      limit 1
    `,
  )

  return result.rows[0]?.completed_at
    ? new Date(result.rows[0].completed_at).toLocaleString('en-CA', {
        timeZone: 'America/Toronto',
      })
    : null
}
