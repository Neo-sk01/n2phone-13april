import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/versature/client', () => ({
  versatureFetch: vi
    .fn()
    // getDomainCdrs: first page returns data, second page returns empty (stops pagination)
    .mockResolvedValueOnce([{ id: 'cdr-1' }])
    // getQueueStats
    .mockResolvedValueOnce({ calls_offered: 10, abandoned_calls: 2 })
    // getQueueSplits
    .mockResolvedValueOnce([{ interval: '2026-04-01T00:00:00Z', volume: 3 }])
    // listQueues
    .mockResolvedValueOnce([{ id: '8020', description: 'English queue' }]),
}))

describe('versature endpoints', () => {
  test('wrap expected endpoint calls', async () => {
    const { getDomainCdrs, getQueueStats, getQueueSplits, listQueues } = await import(
      '@/lib/versature/endpoints'
    )

    expect(await getDomainCdrs('2026-04-01', '2026-04-01')).toEqual([{ id: 'cdr-1' }])
    expect(await getQueueStats('8020', '2026-04-01', '2026-04-01')).toEqual({
      calls_offered: 10,
      abandoned_calls: 2,
    })
    expect(await getQueueSplits('8020', '2026-04-01', '2026-04-01', 'day')).toHaveLength(1)
    expect(await listQueues()).toHaveLength(1)
  })
})
