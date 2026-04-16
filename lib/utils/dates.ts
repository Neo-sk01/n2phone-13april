import {
  addDays,
  endOfDay,
  endOfMonth,
  isBefore,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz'

const TIMEZONE = 'America/Toronto'

/**
 * Returns the Toronto calendar date (YYYY-MM-DD) for a UTC timestamp.
 *
 * Use this instead of `date.toISOString().slice(0, 10)` when querying tables
 * that store Toronto-local business dates. The slice trick returns the UTC
 * date, which is off by one for timestamps that fall after 19:00–20:00 EST/EDT.
 */
export function toTorontoDateString(date: Date): string {
  return formatInTimeZone(date, TIMEZONE, 'yyyy-MM-dd')
}

export type PeriodKey = 'today' | 'this-week' | 'this-month'

export function getPeriodRange(period: PeriodKey, now = new Date()) {
  const zonedNow = toZonedTime(now, TIMEZONE)

  if (period === 'today') {
    return {
      key: period,
      label: 'Today',
      start: fromZonedTime(startOfDay(zonedNow), TIMEZONE),
      end: fromZonedTime(endOfDay(zonedNow), TIMEZONE),
    }
  }

  if (period === 'this-week') {
    const weekStart = startOfWeek(zonedNow, { weekStartsOn: 1 })
    const fridayEnd = endOfDay(addDays(weekStart, 4))
    const effectiveEnd = isBefore(zonedNow, fridayEnd) ? endOfDay(zonedNow) : fridayEnd

    return {
      key: period,
      label: 'This Week',
      start: fromZonedTime(weekStart, TIMEZONE),
      end: fromZonedTime(effectiveEnd, TIMEZONE),
    }
  }

  return {
    key: period,
    label: 'This Month',
    start: fromZonedTime(startOfMonth(zonedNow), TIMEZONE),
    end: fromZonedTime(endOfMonth(zonedNow), TIMEZONE),
  }
}
