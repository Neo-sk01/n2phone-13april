import { describe, expect, test } from 'vitest'
import { excludeWeekends } from '@/lib/filters/weekends'

describe('excludeWeekends', () => {
  test('removes Saturday and Sunday records by date field', () => {
    const result = excludeWeekends(
      [
        { stamp: '2026-04-10T14:00:00Z' },
        { stamp: '2026-04-11T14:00:00Z' },
        { stamp: '2026-04-12T14:00:00Z' },
      ],
      'stamp',
    )

    expect(result).toEqual([{ stamp: '2026-04-10T14:00:00Z' }])
  })
})
