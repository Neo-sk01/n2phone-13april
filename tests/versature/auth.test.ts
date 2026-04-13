import { beforeEach, describe, expect, test, vi } from 'vitest'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

describe('getAccessToken', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-09T12:00:00Z'))
    process.env.VERSATURE_CLIENT_ID = 'client'
    process.env.VERSATURE_CLIENT_SECRET = 'secret'
    process.env.VERSATURE_BASE_URL = 'https://integrate.versature.com/api'
    process.env.VERSATURE_API_VERSION = 'application/vnd.integrate.v1.6.0+json'
  })

  test('caches the token until the safety margin is reached', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'abc',
        token_type: 'Bearer',
        scope: 'Office Manager',
        expires_in: 3600,
      }),
    })

    const { getAccessToken } = await import('@/lib/versature/auth')
    const first = await getAccessToken()
    const second = await getAccessToken()

    expect(first).toBe('abc')
    expect(second).toBe('abc')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('refreshes the token after the expiry safety margin is reached', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'token-1',
          token_type: 'Bearer',
          scope: 'Office Manager',
          expires_in: 120,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'token-2',
          token_type: 'Bearer',
          scope: 'Office Manager',
          expires_in: 120,
        }),
      })

    const { getAccessToken } = await import('@/lib/versature/auth')

    expect(await getAccessToken()).toBe('token-1')
    vi.advanceTimersByTime(61_000)
    expect(await getAccessToken()).toBe('token-2')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
