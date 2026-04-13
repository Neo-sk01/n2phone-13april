import { isSaturday, isSunday } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

const TIMEZONE = 'America/Toronto'

export function excludeWeekends<T extends Record<string, unknown>>(
  rows: T[],
  dateField: keyof T,
) {
  return rows.filter((row) => {
    const value = row[dateField]
    if (typeof value !== 'string' && !(value instanceof Date)) {
      return true
    }

    const zoned = toZonedTime(new Date(value), TIMEZONE)
    return !isSaturday(zoned) && !isSunday(zoned)
  })
}
