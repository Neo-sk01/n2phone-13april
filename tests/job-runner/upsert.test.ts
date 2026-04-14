import { describe, expect, test, vi, beforeEach } from 'vitest'

// Mock the db module
const mockQuery = vi.fn().mockResolvedValue({ rows: [] })
vi.mock('../../job-runner/db', () => ({
  getPool: vi.fn().mockReturnValue({ query: mockQuery }),
  withTransaction: vi.fn(async (fn) => {
    return fn({ query: mockQuery })
  }),
}))

describe('upsertBhKpiSnapshot', () => {
  beforeEach(() => {
    mockQuery.mockClear()
  })

  test('inserts bh_kpis into monthly_kpi_snapshots', async () => {
    const { upsertBhKpiSnapshot } = await import('../../job-runner/upsert')
    const bhKpis = { kpi1: 100, kpi2: 5 }

    await upsertBhKpiSnapshot('2026-03', bhKpis)

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('bh_kpis'),
      ['2026-03', expect.any(String)],
    )
  })
})
