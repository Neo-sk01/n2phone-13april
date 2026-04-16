import { beforeEach, describe, expect, test, vi } from 'vitest'

const invalidateAccessToken = vi.fn()

vi.mock('@/lib/versature/auth', () => ({
  getAccessToken: vi.fn().mockResolvedValue('token-1'),
  invalidateAccessToken,
}))

describe('versatureFetch', () => {
  beforeEach(() => {
    invalidateAccessToken.mockClear()
    vi.resetModules()
  })

  test('retries once on 401', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'nope' })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) })

    vi.stubGlobal('fetch', fetchMock)

    const { versatureFetch } = await import('@/lib/versature/client')
    const result = await versatureFetch('/call_queues/')

    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(invalidateAccessToken).toHaveBeenCalledTimes(1)
  })

  test('throws loudly when the retry also returns 401', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'nope' })
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'still nope' })

    vi.stubGlobal('fetch', fetchMock)

    const { versatureFetch } = await import('@/lib/versature/client')

    await expect(versatureFetch('/call_queues/')).rejects.toThrow(
      'Versature request returned 401 twice for /call_queues/',
    )
    expect(invalidateAccessToken).toHaveBeenCalledTimes(1)
  })
})

describe('extractPagedItems', () => {
  test('normalizes a verified wrapper shape into rows and cursor metadata', async () => {
    const { extractPagedItems } = await import('@/lib/versature/client')

    expect(
      extractPagedItems<{ id: string }>({
        results: [{ id: 'cdr-1' }],
        more: false,
        cursor: null,
      }),
    ).toEqual({
      items: [{ id: 'cdr-1' }],
      more: false,
      cursor: null,
    })
  })
})
