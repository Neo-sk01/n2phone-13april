import { describe, expect, test } from 'vitest'
import { getPeriodRange, toTorontoDateString } from '@/lib/utils/dates'

describe('toTorontoDateString', () => {
  test('returns the Toronto calendar date for a UTC timestamp', () => {
    // Toronto Mar 15 10:00 EDT = UTC 14:00.
    expect(toTorontoDateString(new Date('2026-03-15T14:00:00Z'))).toBe('2026-03-15')
  })

  test('returns the Toronto date for a timestamp that straddles UTC midnight', () => {
    // Toronto Mar 31 23:59:59.999 EDT = UTC Apr 1 03:59:59.999. Toronto-local
    // date is still Mar 31. slice(0,10) of the ISO would give "2026-04-01"
    // which is the bug this helper prevents.
    expect(toTorontoDateString(new Date('2026-04-01T03:59:59.999Z'))).toBe('2026-03-31')
  })

  test('returns the Toronto date for a pre-DST timestamp (EST, UTC-5)', () => {
    // Toronto Mar 1 00:00 EST = UTC 05:00.
    expect(toTorontoDateString(new Date('2026-03-01T05:00:00Z'))).toBe('2026-03-01')
    // Toronto Feb 28 23:00 EST = UTC Mar 1 04:00 = Feb 28 Toronto.
    expect(toTorontoDateString(new Date('2026-03-01T04:00:00Z'))).toBe('2026-02-28')
  })
})


describe('getPeriodRange', () => {
  test('returns a Monday-to-Friday range for this week in America/Toronto', () => {
    const range = getPeriodRange('this-week', new Date('2026-04-09T12:00:00Z'))

    expect(range.label).toBe('This Week')
    expect(range.start.toISOString()).toBe('2026-04-06T04:00:00.000Z')
    expect(range.end.toISOString()).toBe('2026-04-10T03:59:59.999Z')
  })
})
