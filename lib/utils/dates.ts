import {
  addDays,
  endOfDay,
  endOfMonth,
  isBefore,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'

const TIMEZONE = 'America/Toronto'

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
