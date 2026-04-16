import { describe, expect, test, vi, beforeEach } from 'vitest'

/**
 * Regression coverage for the "degraded pulls must remain retriable" invariant.
 *
 * Before the fix, runMonthlyPull short-circuited on any row with
 * status='completed' regardless of ai_health_status. A month whose ticket
 * fetch / correlation failed was therefore permanently stuck — the normal
 * rerun path refused to touch it.
 */

const poolQueryMock = vi.fn()
const connectMock = vi.fn()

vi.mock('../../job-runner/db', () => ({
  getPool: () => ({ query: poolQueryMock, connect: connectMock }),
  withTransaction: vi.fn(),
}))
// Stub every downstream module runMonthlyPull touches on the happy path so the
// test can focus on the short-circuit decision alone.
vi.mock('@/lib/versature/endpoints', () => ({
  getQueueStats: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/versature/queues', () => ({
  ENGLISH_QUEUE_ID: '8020',
  FRENCH_QUEUE_ID: '8021',
  AI_OVERFLOW_QUEUE_IDS: ['8030', '8031'] as const,
}))
vi.mock('@/lib/connectwise/client', () => ({
  fetchTickets: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/versature/cdrs-users', () => ({
  getCdrsForUsers: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/connectwise/runner', () => ({
  runMonthlyCorrelation: vi
    .fn()
    .mockResolvedValue({ candidates: 0, matched: 0, exact: 0, fuzzy: 0 }),
}))
vi.mock('@/lib/versature/sync', () => ({
  syncMonthQueueData: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/kpis/get-dashboard-data', () => ({
  getDashboardData: vi.fn().mockResolvedValue({}),
}))

describe('runMonthlyPull short-circuit behavior', () => {
  beforeEach(() => {
    poolQueryMock.mockReset()
    connectMock.mockReset()
    vi.resetModules()
  })

  test('returns already_pulled only when status=completed AND ai_health_status=complete', async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        {
          status: 'completed',
          started_at: new Date('2026-03-01T00:00:00Z'),
          completed_at: new Date('2026-03-15T12:00:00Z'),
          record_counts: { cdrs: 100, queueStats: 4, tickets: 50 },
          ai_health_status: 'complete',
        },
      ],
    })

    const { runMonthlyPull } = await import('../../job-runner/pull')
    const result = await runMonthlyPull('2026-03')

    expect(result.status).toBe('already_pulled')
    // Must have short-circuited — no CAS insert should have happened.
    expect(poolQueryMock).toHaveBeenCalledTimes(1)
  })

  test('falls through to rerun when status=completed but ai_health_status=degraded', async () => {
    poolQueryMock
      .mockResolvedValueOnce({
        rows: [
          {
            status: 'completed',
            started_at: new Date('2026-03-01T00:00:00Z'),
            completed_at: new Date('2026-03-15T12:00:00Z'),
            record_counts: { cdrs: 0, queueStats: 0, tickets: 0 },
            ai_health_status: 'degraded',
          },
        ],
      })
      // CAS returns no row (simulating another run holding the lock) so we can
      // assert on the status without running the full pull to completion.
      .mockResolvedValueOnce({ rows: [] })

    const { runMonthlyPull } = await import('../../job-runner/pull')
    const result = await runMonthlyPull('2026-03')

    // NOT already_pulled — the degraded month must be retried.
    expect(result.status).not.toBe('already_pulled')
    // The CAS insert must have been attempted, proving we fell through.
    expect(poolQueryMock).toHaveBeenCalledTimes(2)
    const casSql = String(poolQueryMock.mock.calls[1][0])
    expect(casSql).toMatch(/INSERT INTO monthly_pull_log/i)
  })

  test('falls through to rerun when ai_health_status is unknown (legacy rows)', async () => {
    poolQueryMock
      .mockResolvedValueOnce({
        rows: [
          {
            status: 'completed',
            started_at: new Date('2026-02-01T00:00:00Z'),
            completed_at: new Date('2026-02-15T12:00:00Z'),
            record_counts: {},
            ai_health_status: 'unknown',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })

    const { runMonthlyPull } = await import('../../job-runner/pull')
    const result = await runMonthlyPull('2026-02')

    expect(result.status).not.toBe('already_pulled')
    expect(poolQueryMock).toHaveBeenCalledTimes(2)
  })
})
