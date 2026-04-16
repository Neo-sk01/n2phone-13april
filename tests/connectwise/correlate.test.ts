import { describe, expect, test } from 'vitest'
import { correlateCall } from '@/lib/connectwise/correlate'

type T = Parameters<typeof correlateCall>[1][number]
const ticket = (over: Partial<T>): T => ({
  id: 1,
  normalizedPhone: '14165550100',
  dateEntered: new Date('2026-03-15T10:00:00Z'),
  ...over,
})

describe('correlateCall', () => {
  const call = {
    cdrId: 'c1',
    normalizedPhone: '14165550100',
    startTime: new Date('2026-03-15T09:58:00Z'),
  }

  test('exact match: same phone, within -5m..+30m window', () => {
    const r = correlateCall(call, [ticket({})])
    expect(r).toEqual({ ticketId: 1, confidence: 'exact', reason: expect.any(String) })
  })

  test('fuzzy match: same phone, within -1h..+4h but outside exact window', () => {
    const r = correlateCall(call, [
      ticket({ dateEntered: new Date('2026-03-15T13:00:00Z') }),
    ])
    expect(r.confidence).toBe('fuzzy')
  })

  test('no match: same phone but > 4h away', () => {
    const r = correlateCall(call, [
      ticket({ dateEntered: new Date('2026-03-15T18:00:00Z') }),
    ])
    expect(r.confidence).toBe('none')
  })

  test('no match: different phone', () => {
    const r = correlateCall(call, [ticket({ normalizedPhone: '14165550200' })])
    expect(r.confidence).toBe('none')
  })

  test('prefers exact over fuzzy when both present', () => {
    const r = correlateCall(call, [
      ticket({ id: 99, dateEntered: new Date('2026-03-15T13:00:00Z') }),
      ticket({ id: 42 }),
    ])
    expect(r).toMatchObject({ ticketId: 42, confidence: 'exact' })
  })

  test('picks the closest ticket when multiple fuzzy candidates exist', () => {
    const r = correlateCall(call, [
      ticket({ id: 1, dateEntered: new Date('2026-03-15T13:00:00Z') }),
      ticket({ id: 2, dateEntered: new Date('2026-03-15T11:30:00Z') }),
    ])
    expect(r).toMatchObject({ ticketId: 2, confidence: 'fuzzy' })
  })

  test('skips tickets without normalized phone', () => {
    const r = correlateCall(call, [ticket({ normalizedPhone: null })])
    expect(r.confidence).toBe('none')
  })

  test('skips calls without normalized phone', () => {
    const r = correlateCall({ ...call, normalizedPhone: null }, [ticket({})])
    expect(r.confidence).toBe('none')
  })
})
