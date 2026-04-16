import { describe, expect, test, vi, beforeEach } from 'vitest'

vi.mock('@/lib/versature/client', () => ({
  versatureFetch: vi.fn(),
}))

describe('getCdrsForUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  test('queries each user id and concatenates results', async () => {
    const { versatureFetch } = await import('@/lib/versature/client')
    const mock = vi.mocked(versatureFetch)
    mock
      .mockResolvedValueOnce([{ id: 'a', to: { user: '8030' } }])
      .mockResolvedValueOnce([{ id: 'b', to: { user: '8031' } }])

    const { getCdrsForUsers } = await import('@/lib/versature/cdrs-users')
    const calls = await getCdrsForUsers(['8030', '8031'], '2026-03-01', '2026-03-31', {
      pauseMs: 0,
    })

    expect(calls).toHaveLength(2)
    expect(calls.map((c) => c.id).sort()).toEqual(['a', 'b'])
    expect(mock).toHaveBeenCalledTimes(2)
    expect(mock.mock.calls[0][0]).toContain('to.user=8030')
    expect(mock.mock.calls[1][0]).toContain('to.user=8031')
  })

  test('paginates while pages are full', async () => {
    const { versatureFetch } = await import('@/lib/versature/client')
    const full = Array.from({ length: 20 }, (_, i) => ({ id: `p1-${i}`, to: { user: '8030' } }))
    const short = [{ id: 'p2-0', to: { user: '8030' } }]
    vi.mocked(versatureFetch).mockResolvedValueOnce(full).mockResolvedValueOnce(short)

    const { getCdrsForUsers } = await import('@/lib/versature/cdrs-users')
    const calls = await getCdrsForUsers(['8030'], '2026-03-01', '2026-03-31', {
      pageLimit: 20,
      pauseMs: 0,
    })

    expect(calls).toHaveLength(21)
    expect(vi.mocked(versatureFetch)).toHaveBeenCalledTimes(2)
  })

  test('skips user on thrown error and continues', async () => {
    const { versatureFetch } = await import('@/lib/versature/client')
    vi.mocked(versatureFetch)
      .mockRejectedValueOnce(new Error('429'))
      .mockResolvedValueOnce([{ id: 'ok', to: { user: '8031' } }])

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { getCdrsForUsers } = await import('@/lib/versature/cdrs-users')
    const calls = await getCdrsForUsers(['8030', '8031'], '2026-03-01', '2026-03-31', {
      pauseMs: 0,
    })

    expect(calls).toHaveLength(1)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
