import { describe, expect, test, vi, beforeEach } from 'vitest'

describe('correlateAll', () => {
  test('maps each call through correlateCall and preserves cdrId', async () => {
    const { correlateAll } = await import('@/lib/connectwise/runner')
    const calls = [
      { cdrId: 'a', normalizedPhone: '14165550100', startTime: new Date('2026-03-15T09:58:00Z') },
      { cdrId: 'b', normalizedPhone: '14165550200', startTime: new Date('2026-03-15T10:00:00Z') },
    ]
    const tickets = [
      { id: 1, normalizedPhone: '14165550100', dateEntered: new Date('2026-03-15T10:00:00Z') },
    ]

    const rows = correlateAll(calls, tickets)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ cdrId: 'a', ticketId: 1, confidence: 'exact' })
    expect(rows[1]).toMatchObject({ cdrId: 'b', ticketId: null, confidence: 'none' })
  })
})

describe('monthToTicketWindow', () => {
  test('returns Toronto month start minus 1h and month end plus 4h', async () => {
    const { monthToTicketWindow } = await import('@/lib/connectwise/runner')
    const { start, end } = monthToTicketWindow('2026-03')

    // Toronto Mar 1 00:00 EST = UTC 05:00. Minus 1h = UTC 04:00.
    expect(start.toISOString()).toBe('2026-03-01T04:00:00.000Z')
    // Toronto Mar 31 23:59:59.999 EDT = UTC Apr 1 03:59:59.999. Plus 4h = UTC Apr 1 07:59:59.999.
    expect(end.toISOString()).toBe('2026-04-01T07:59:59.999Z')
  })

  test('handles December (year rollover)', async () => {
    const { monthToTicketWindow } = await import('@/lib/connectwise/runner')
    const { start, end } = monthToTicketWindow('2026-12')
    // Dec 1 Toronto EST = UTC 05:00; minus 1h = UTC 04:00.
    expect(start.toISOString()).toBe('2026-12-01T04:00:00.000Z')
    // Dec 31 23:59:59.999 Toronto EST = UTC Jan 1 04:59:59.999; plus 4h = UTC Jan 1 08:59:59.999.
    expect(end.toISOString()).toBe('2027-01-01T08:59:59.999Z')
  })

  test('handles January (year rollover on start)', async () => {
    const { monthToTicketWindow } = await import('@/lib/connectwise/runner')
    const { start } = monthToTicketWindow('2027-01')
    // Jan 1 Toronto EST = UTC 05:00; minus 1h = UTC 04:00.
    expect(start.toISOString()).toBe('2027-01-01T04:00:00.000Z')
  })
})

describe('runMonthlyCorrelation', () => {
  const queryMock = vi.fn()
  const connectMock = vi.fn()

  beforeEach(() => {
    queryMock.mockReset()
    connectMock.mockReset()
    vi.resetModules()
    vi.doMock('@/lib/db/client', () => ({
      getPool: () => ({
        query: queryMock,
        connect: connectMock,
      }),
    }))
  })

  test('queries tickets by date_entered window, not by month partition', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })  // ai_candidate_calls
      .mockResolvedValueOnce({ rows: [] })  // tickets

    // Full-replace wraps writes in a pool.connect() transaction even when
    // there are zero matches, so the test needs to mock the client path too.
    connectMock.mockResolvedValueOnce({ query: vi.fn().mockResolvedValue({}), release: vi.fn() })

    const { runMonthlyCorrelation } = await import('@/lib/connectwise/runner')
    await runMonthlyCorrelation('2026-03')

    expect(queryMock).toHaveBeenCalledTimes(2)
    const ticketsCall = queryMock.mock.calls[1]
    const ticketsSql: string = ticketsCall[0]
    const ticketsParams: unknown[] = ticketsCall[1]

    expect(ticketsSql).toMatch(/date_entered\s+>=/)
    expect(ticketsSql).toMatch(/date_entered\s+<=/)
    expect(ticketsSql).not.toMatch(/\bmonth\s*=\s*\$1/)
    expect(ticketsParams[0]).toBeInstanceOf(Date)
    expect(ticketsParams[1]).toBeInstanceOf(Date)
    expect((ticketsParams[0] as Date).toISOString()).toBe('2026-03-01T04:00:00.000Z')
    expect((ticketsParams[1] as Date).toISOString()).toBe('2026-04-01T07:59:59.999Z')
  })

  test('replaces all correlations for the month on rerun (full replacement)', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })  // calls
      .mockResolvedValueOnce({ rows: [] })  // tickets

    const writeMock = vi.fn().mockResolvedValue({})
    const releaseMock = vi.fn()
    connectMock.mockResolvedValueOnce({ query: writeMock, release: releaseMock })

    const { runMonthlyCorrelation } = await import('@/lib/connectwise/runner')
    await runMonthlyCorrelation('2026-03')

    const writeStatements = writeMock.mock.calls.map((c) => String(c[0]))
    const deleteIdx = writeStatements.findIndex((s) =>
      /DELETE\s+FROM\s+connectwise_correlations/i.test(s),
    )
    expect(deleteIdx).toBeGreaterThanOrEqual(0)
    // The delete must run inside a transaction — BEGIN must come first.
    const beginIdx = writeStatements.findIndex((s) => /^\s*BEGIN/i.test(s))
    expect(beginIdx).toBeGreaterThanOrEqual(0)
    expect(beginIdx).toBeLessThan(deleteIdx)
    // Delete is scoped to the month being rerun, not the whole table.
    const deleteCall = writeMock.mock.calls[deleteIdx]
    expect(deleteCall[1]).toEqual(['2026-03'])
    expect(releaseMock).toHaveBeenCalled()
  })

  test('drops stale rows when a call no longer matches on rerun', async () => {
    // First run: one call, one ticket → one correlation.
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            cdr_id: 'c1',
            normalized_phone: '14165550100',
            start_time: new Date('2026-03-15T10:00:00Z'),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 10,
            normalized_phone: '14165550100',
            date_entered: new Date('2026-03-15T10:05:00Z'),
          },
        ],
      })
    const firstWrite = vi.fn().mockResolvedValue({})
    connectMock.mockResolvedValueOnce({ query: firstWrite, release: vi.fn() })

    const { runMonthlyCorrelation } = await import('@/lib/connectwise/runner')
    const first = await runMonthlyCorrelation('2026-03')
    expect(first.matched).toBe(1)
    expect(firstWrite.mock.calls.some((c) =>
      /INSERT INTO connectwise_correlations/i.test(String(c[0])),
    )).toBe(true)

    // Rerun: same call, but ticket phone no longer matches → no correlation.
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            cdr_id: 'c1',
            normalized_phone: '14165550100',
            start_time: new Date('2026-03-15T10:00:00Z'),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 10,
            normalized_phone: '14165559999',  // phone changed
            date_entered: new Date('2026-03-15T10:05:00Z'),
          },
        ],
      })
    const secondWrite = vi.fn().mockResolvedValue({})
    connectMock.mockResolvedValueOnce({ query: secondWrite, release: vi.fn() })

    const second = await runMonthlyCorrelation('2026-03')
    expect(second.matched).toBe(0)

    // Full-replace semantics: the delete must still run even when there are
    // no new matches to insert, otherwise the old row survives.
    const stmts = secondWrite.mock.calls.map((c) => String(c[0]))
    expect(stmts.some((s) => /DELETE\s+FROM\s+connectwise_correlations/i.test(s))).toBe(true)
    expect(stmts.some((s) => /INSERT INTO connectwise_correlations/i.test(s))).toBe(false)
  })

  test('correlates a Mar 31 call to an Apr 1 ticket (boundary case)', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            cdr_id: 'c-boundary',
            normalized_phone: '14165550100',
            start_time: new Date('2026-04-01T03:58:00Z'),  // Mar 31 23:58 Toronto
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 42,
            normalized_phone: '14165550100',
            date_entered: new Date('2026-04-01T05:30:00Z'),  // Apr 1 01:30 Toronto
          },
        ],
      })

    const writeMock = vi.fn().mockResolvedValue({})
    connectMock.mockResolvedValueOnce({
      query: writeMock,
      release: vi.fn(),
    })

    const { runMonthlyCorrelation } = await import('@/lib/connectwise/runner')
    const result = await runMonthlyCorrelation('2026-03')

    expect(result).toMatchObject({ candidates: 1, matched: 1, fuzzy: 1 })
    const insertCall = writeMock.mock.calls.find((c) =>
      String(c[0]).includes('INSERT INTO connectwise_correlations'),
    )
    expect(insertCall).toBeDefined()
    expect(insertCall![1]).toEqual([
      'c-boundary',
      '2026-03',
      42,
      'fuzzy',
      expect.any(String),
    ])
  })
})
