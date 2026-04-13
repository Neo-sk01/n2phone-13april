import { describe, expect, test } from 'vitest'
import { buildUpsertQueueStatsStatement } from '@/lib/db/queries'

describe('buildUpsertQueueStatsStatement', () => {
  test('targets queue_stats_daily by queue_id and stats_date', () => {
    const sql = buildUpsertQueueStatsStatement()
    expect(sql).toContain('insert into queue_stats_daily')
    expect(sql).toContain('on conflict (queue_id, stats_date)')
  })
})
