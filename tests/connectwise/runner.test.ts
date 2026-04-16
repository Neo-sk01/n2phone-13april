import { describe, expect, test } from 'vitest'
import { correlateAll } from '@/lib/connectwise/runner'

describe('correlateAll', () => {
  test('maps each call through correlateCall and preserves cdrId', () => {
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
