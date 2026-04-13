import { describe, expect, test } from 'vitest'
import { filterToTargetDnis } from '@/lib/filters/dnis'

describe('filterToTargetDnis', () => {
  test('keeps only records whose toId is a tracked DNIS', () => {
    const rows = [
      { toId: '16135949199' },
      { toId: '6135949199' },
      { toId: '18005551212' },
    ]

    expect(filterToTargetDnis(rows, 'toId')).toEqual([
      { toId: '16135949199' },
      { toId: '6135949199' },
    ])
  })
})
