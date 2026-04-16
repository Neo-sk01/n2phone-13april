import { describe, expect, test, vi, beforeEach } from 'vitest'

vi.mock('@/lib/connectwise/auth', () => ({
  buildConnectWiseHeaders: vi.fn().mockReturnValue({
    Authorization: 'Basic dGVzdA==',
    'Content-Type': 'application/json',
    clientId: 'test-client',
  }),
}))

describe('fetchTickets', () => {
  beforeEach(() => {
    vi.stubEnv('CONNECTWISE_BASE_URL', 'https://cw.example.com/v4_6_release/apis/3.0')
    vi.stubEnv('CONNECTWISE_SOURCE_ID', '12')
  })

  test('paginates until a short page is returned', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i, summary: `ticket-${i}` }))
    const page2 = [{ id: 100, summary: 'ticket-100' }, { id: 101, summary: 'ticket-101' }]

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => page1 })
      .mockResolvedValueOnce({ ok: true, json: async () => page2 })

    vi.stubGlobal('fetch', fetchMock)

    const { fetchTickets } = await import('@/lib/connectwise/client')
    const tickets = await fetchTickets('2026-03-01', '2026-03-31')

    expect(tickets).toHaveLength(102)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const url1 = new URL(fetchMock.mock.calls[0][0])
    expect(url1.searchParams.get('page')).toBe('1')
    expect(url1.searchParams.get('pageSize')).toBe('100')
  })

  test('returns empty array when first page is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [] }))

    const { fetchTickets } = await import('@/lib/connectwise/client')
    const tickets = await fetchTickets('2026-03-01', '2026-03-31')

    expect(tickets).toHaveLength(0)
  })

  test('requests the enriched fields list', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [] })
    vi.stubGlobal('fetch', fetchMock)

    const { fetchTickets } = await import('@/lib/connectwise/client')
    await fetchTickets('2026-03-01', '2026-03-31')

    const url = new URL(fetchMock.mock.calls[0][0])
    const fields = url.searchParams.get('fields') ?? ''
    expect(fields).toContain('id')
    expect(fields).toContain('status/name')
    expect(fields).toContain('resolvedDateTime')
    expect(fields).toContain('mergedIntoTicket/id')
    expect(fields).toContain('contact/phoneNumber')
  })

  test('logs and stops pagination on non-OK response', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' }),
    )

    const { fetchTickets } = await import('@/lib/connectwise/client')
    const tickets = await fetchTickets('2026-03-01', '2026-03-31')

    expect(tickets).toHaveLength(0)
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
