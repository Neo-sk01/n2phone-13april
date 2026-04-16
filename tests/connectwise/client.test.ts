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

  test('throws on non-OK response on the first page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      }),
    )

    const { fetchTickets } = await import('@/lib/connectwise/client')
    await expect(fetchTickets('2026-03-01', '2026-03-31')).rejects.toThrow(/500/)
  })

  test('throws on a non-OK mid-pagination page instead of returning partial data', async () => {
    // This is the data-safety case: if we silently returned `page1` here,
    // the correlation runner would DELETE all matches for the month and
    // rebuild them from an incomplete ticket set, destroying valid matches.
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i, summary: `t-${i}` }))

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => page1 })
        .mockResolvedValueOnce({ ok: false, status: 502, statusText: 'Bad Gateway' }),
    )

    const { fetchTickets } = await import('@/lib/connectwise/client')
    await expect(fetchTickets('2026-03-01', '2026-03-31')).rejects.toThrow(/502/)
  })
})
