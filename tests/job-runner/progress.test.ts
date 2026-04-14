import { describe, expect, test, vi, beforeEach } from 'vitest'

const mockQuery = vi.fn().mockResolvedValue({ rows: [] })
vi.mock('../../job-runner/db', () => ({
  getPool: vi.fn().mockReturnValue({
    query: mockQuery,
    connect: vi.fn(),
  }),
  withTransaction: vi.fn(),
}))

describe('updateProgress', () => {
  beforeEach(() => {
    mockQuery.mockClear()
  })

  test('writes progress_pct, progress_message, and total_pages to monthly_pull_log', async () => {
    const { updateProgress } = await import('../../job-runner/pull')
    await updateProgress('2026-03', 45, 'Fetching CDRs for 2026-03-14…', 31)

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('progress_pct'),
      ['2026-03', 45, 'Fetching CDRs for 2026-03-14…', 31],
    )
  })
})
