import { describe, expect, test } from 'vitest'
import { getPeriodRange } from '@/lib/utils/dates'

describe('getPeriodRange', () => {
  test('returns a Monday-to-Friday range for this week in America/Toronto', () => {
    const range = getPeriodRange('this-week', new Date('2026-04-09T12:00:00Z'))

    expect(range.label).toBe('This Week')
    expect(range.start.toISOString()).toBe('2026-04-06T04:00:00.000Z')
    expect(range.end.toISOString()).toBe('2026-04-10T03:59:59.999Z')
  })
})
