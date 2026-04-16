import { describe, expect, test, vi, beforeEach } from 'vitest'

const queryMock = vi.fn()
vi.mock('@/lib/db/client', () => ({ getPool: () => ({ query: queryMock }) }))

describe('readKPISnapshotWithHealth', () => {
  beforeEach(() => {
    queryMock.mockReset()
    vi.resetModules()
  })

  test('returns kpis + aiHealthStatus joined from monthly_pull_log', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          kpis: {
            kpi1: { primaryCount: 100 },
            kpi11: { rate: 0.75 },
          },
          ai_health_status: 'complete',
        },
      ],
    })

    const { readKPISnapshotWithHealth } = await import('@/lib/db/historical')
    const result = await readKPISnapshotWithHealth('2026-03')

    expect(result).not.toBeNull()
    expect(result?.kpis).toMatchObject({ kpi1: { primaryCount: 100 } })
    expect(result?.aiHealthStatus).toBe('complete')

    const sql: string = queryMock.mock.calls[0][0]
    expect(sql).toMatch(/monthly_kpi_snapshots/i)
    expect(sql).toMatch(/monthly_pull_log/i)
    expect(sql).toMatch(/ai_health_status/i)
  })

  test('returns aiHealthStatus=degraded when the pull_log is degraded', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          kpis: { kpi1: { primaryCount: 50 } },
          ai_health_status: 'degraded',
        },
      ],
    })

    const { readKPISnapshotWithHealth } = await import('@/lib/db/historical')
    const r = await readKPISnapshotWithHealth('2026-03')
    expect(r?.aiHealthStatus).toBe('degraded')
  })

  test('returns aiHealthStatus=unknown for legacy rows (pre-migration-006)', async () => {
    // Legacy: snapshot JSON carries kpi11..14 but the DB column is 'unknown'
    // (migration 006 default). Pull_log is the authoritative source — must
    // override any stale 'complete' in the JSON and cascade to the UI.
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          kpis: {
            kpi1: { primaryCount: 50 },
            kpi11: { rate: 0.5 },
            aiHealthStatus: 'complete',
          },
          ai_health_status: 'unknown',
        },
      ],
    })

    const { readKPISnapshotWithHealth } = await import('@/lib/db/historical')
    const r = await readKPISnapshotWithHealth('2025-12')
    expect(r?.aiHealthStatus).toBe('unknown')
  })

  test('returns null when no snapshot exists', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })
    const { readKPISnapshotWithHealth } = await import('@/lib/db/historical')
    const r = await readKPISnapshotWithHealth('2026-03')
    expect(r).toBeNull()
  })
})

describe('resolveHistoricalMonth', () => {
  beforeEach(() => {
    queryMock.mockReset()
    vi.resetModules()
  })

  test('accepts a YYYY-MM string, validates it is a past Toronto month', async () => {
    const { resolveHistoricalMonth } = await import('@/lib/db/historical')
    // Test against a fixed "now" so DST / year-boundary edge cases don't flake.
    const now = new Date('2026-04-15T12:00:00Z')
    expect(resolveHistoricalMonth('2026-03', now)).toBe('2026-03')
    expect(resolveHistoricalMonth('2025-01', now)).toBe('2025-01')
  })

  test('rejects the current Toronto month', async () => {
    const { resolveHistoricalMonth } = await import('@/lib/db/historical')
    const now = new Date('2026-04-15T12:00:00Z')
    expect(resolveHistoricalMonth('2026-04', now)).toBeNull()
  })

  test('rejects a future month', async () => {
    const { resolveHistoricalMonth } = await import('@/lib/db/historical')
    const now = new Date('2026-04-15T12:00:00Z')
    expect(resolveHistoricalMonth('2026-05', now)).toBeNull()
  })

  test('rejects malformed input', async () => {
    const { resolveHistoricalMonth } = await import('@/lib/db/historical')
    const now = new Date('2026-04-15T12:00:00Z')
    expect(resolveHistoricalMonth('2026', now)).toBeNull()
    expect(resolveHistoricalMonth('2026-13', now)).toBeNull()
    expect(resolveHistoricalMonth('', now)).toBeNull()
    expect(resolveHistoricalMonth('not-a-month', now)).toBeNull()
  })
})
