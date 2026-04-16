import { describe, expect, test, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const queryMock = vi.fn()
vi.mock('@/lib/db/client', () => ({ getPool: () => ({ query: queryMock }) }))

function req(month: string) {
  return new NextRequest(`http://localhost/api/jobs/monthly-pull/status?month=${month}`)
}

describe('/api/jobs/monthly-pull/status', () => {
  beforeEach(() => {
    queryMock.mockReset()
    vi.resetModules()
  })

  test('returns aiHealthStatus when the pull_log row has one', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          status: 'completed',
          started_at: new Date('2026-03-01T00:00:00Z'),
          completed_at: new Date('2026-03-15T12:00:00Z'),
          record_counts: { cdrs: 10, queueStats: 4, tickets: 50, correlations: 8 },
          error: null,
          progress_pct: 100,
          progress_message: 'Complete',
          total_pages: 31,
          ai_health_status: 'degraded',
        },
      ],
    })

    const { GET } = await import('@/app/api/jobs/monthly-pull/status/route')
    const res = await GET(req('2026-03'))
    const body = await res.json()

    expect(body.aiHealthStatus).toBe('degraded')
    expect(body.status).toBe('completed')
  })

  test('SELECT includes ai_health_status column', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })
    const { GET } = await import('@/app/api/jobs/monthly-pull/status/route')
    await GET(req('2026-03'))
    const sql: string = queryMock.mock.calls[0][0]
    expect(sql).toMatch(/\bai_health_status\b/)
  })

  test('returns aiHealthStatus undefined for legacy rows where the column is null', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          status: 'completed',
          started_at: new Date('2025-12-01T00:00:00Z'),
          completed_at: new Date('2025-12-15T12:00:00Z'),
          record_counts: null,
          error: null,
          progress_pct: 100,
          progress_message: 'Complete',
          total_pages: null,
          ai_health_status: null,
        },
      ],
    })

    const { GET } = await import('@/app/api/jobs/monthly-pull/status/route')
    const res = await GET(req('2025-12'))
    const body = await res.json()

    expect(body.aiHealthStatus).toBeUndefined()
  })
})
