import { describe, expect, test } from 'vitest'
import { normalizePhone } from '@/lib/utils/phone'

describe('normalizePhone', () => {
  test('strips formatting from NANP numbers', () => {
    expect(normalizePhone('(416) 555-0100')).toBe('14165550100')
    expect(normalizePhone('416-555-0100')).toBe('14165550100')
    expect(normalizePhone('416.555.0100')).toBe('14165550100')
    expect(normalizePhone('4165550100')).toBe('14165550100')
  })

  test('preserves leading 1 when already present', () => {
    expect(normalizePhone('1-416-555-0100')).toBe('14165550100')
    expect(normalizePhone('+14165550100')).toBe('14165550100')
  })

  test('returns null for empty/invalid input', () => {
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
    expect(normalizePhone(undefined)).toBeNull()
    expect(normalizePhone('abc')).toBeNull()
    expect(normalizePhone('123')).toBeNull()
  })

  test('handles extensions by discarding them', () => {
    expect(normalizePhone('416-555-0100 x123')).toBe('14165550100')
    expect(normalizePhone('4165550100;ext=5')).toBe('14165550100')
  })

  test('returns null when digits count is invalid', () => {
    expect(normalizePhone('12345')).toBeNull()
    expect(normalizePhone('123456789012345')).toBeNull()
  })
})
