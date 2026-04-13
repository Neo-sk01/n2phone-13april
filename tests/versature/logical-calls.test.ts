import { describe, expect, test } from 'vitest'
import { buildLogicalCalls } from '@/lib/versature/logical-calls'
import { cdrFixtures } from '@/tests/fixtures/kpi-fixtures'

describe('buildLogicalCalls', () => {
  test('deduplicates multiple CDR segments into one logical call using the shared call id when present', () => {
    const logicalCalls = buildLogicalCalls(cdrFixtures)

    expect(logicalCalls).toHaveLength(2)
    expect(logicalCalls[0].dedupeKey).toBe('call-1')
    expect(logicalCalls[0].dnis).toBe('16135949199')
    expect(logicalCalls[0].answered).toBe(true)
    expect(logicalCalls[0].durationSeconds).toBe(67)
  })

  test('falls back to caller number plus Toronto-local minute bucket when no shared call id exists', () => {
    const logicalCalls = buildLogicalCalls([
      {
        id: 'cdr-fallback-a',
        start_time: '2026-04-01T13:00:02Z',
        answer_time: null,
        end_time: '2026-04-01T13:00:08Z',
        duration: 8,
        from: { number: '+16135550009', user: null, name: 'Caller 9' },
        to: { id: '16135949199' },
      },
      {
        id: 'cdr-fallback-b',
        start_time: '2026-04-01T13:00:41Z',
        answer_time: '2026-04-01T13:00:45Z',
        end_time: '2026-04-01T13:01:20Z',
        duration: 35,
        from: { number: '+16135550009', user: null, name: 'Caller 9' },
        to: { id: '8020' },
      },
    ])

    expect(logicalCalls).toHaveLength(1)
    expect(logicalCalls[0].dedupeKey).toContain('|+16135550009')
  })
})
