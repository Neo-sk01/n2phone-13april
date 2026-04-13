import { describe, expect, test } from 'vitest'
import { formatDuration, formatPercent } from '@/lib/utils/format'

describe('format helpers', () => {
  test('formats seconds into Xm Ys', () => {
    expect(formatDuration(125)).toBe('2m 5s')
  })

  test('formats a decimal ratio as a percent string', () => {
    expect(formatPercent(0.125)).toBe('12.5%')
  })
})
