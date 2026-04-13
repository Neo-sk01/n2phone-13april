import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/db/queries', () => ({
  getShortAnsweredCallCount: vi.fn().mockResolvedValue(1),
}))

describe('computeShortCalls', () => {
  test('counts only answered calls shorter than ten seconds', async () => {
    const { computeShortCalls } = await import('@/lib/kpis/short-calls')
    expect(
      await computeShortCalls({ start: new Date('2026-04-01T00:00:00Z'), end: new Date('2026-04-01T23:59:59Z') }),
    ).toEqual({ totalShortCalls: 1, thresholdSeconds: 10 })
  })
})
