import { createHash } from 'node:crypto'
import { formatInTimeZone } from 'date-fns-tz'
import type { VersatureCdr } from './types'
import { isDnisMatch } from '@/lib/filters/dnis'

export type LogicalCall = {
  callDate: string
  dedupeKey: string
  callerNumber: string | null
  dnis: string
  startTime: string
  endTime: string
  answered: boolean
  durationSeconds: number
  representativeHash: string
  payload: Record<string, unknown>
}

function hashPayload(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function getSharedCallId(cdr: VersatureCdr) {
  return cdr.call_id ?? cdr.from.call_id ?? null
}

function buildFallbackGroupKey(cdr: VersatureCdr) {
  const callerNumber = cdr.from.id ?? cdr.from.number ?? 'unknown'
  const localMinuteBucket = formatInTimeZone(
    new Date(cdr.start_time),
    'America/Toronto',
    "yyyy-MM-dd'T'HH:mm",
  )
  return `${localMinuteBucket}|${callerNumber}`
}

export function buildLogicalCalls(cdrs: VersatureCdr[]): LogicalCall[] {
  const grouped = new Map<string, VersatureCdr[]>()

  for (const cdr of cdrs) {
    const key = getSharedCallId(cdr) ?? buildFallbackGroupKey(cdr)
    const rows = grouped.get(key) ?? []
    rows.push(cdr)
    grouped.set(key, rows)
  }

  return [...grouped.entries()]
    .map(([dedupeKey, rows]) => {
      const dnisRepresentative = rows.find((row) =>
        row.to.id ? isDnisMatch(String(row.to.id)) : false,
      )

      if (!dnisRepresentative || !dnisRepresentative.to.id) {
        return null
      }

      const answeredRows = rows.filter((row) => row.answer_time !== null)
      const durationSeconds =
        answeredRows.length > 0
          ? Math.max(...answeredRows.map((row) => row.duration))
          : Math.max(...rows.map((row) => row.duration))
      const latestEndTime = rows
        .map((row) => row.end_time)
        .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())
        .at(-1)!

      return {
        callDate: formatInTimeZone(
          new Date(dnisRepresentative.start_time),
          'America/Toronto',
          'yyyy-MM-dd',
        ),
        dedupeKey,
        callerNumber: dnisRepresentative.from.id ?? dnisRepresentative.from.number ?? null,
        dnis: dnisRepresentative.to.id,
        startTime: dnisRepresentative.start_time,
        endTime: latestEndTime,
        answered: rows.some((row) => row.answer_time !== null),
        durationSeconds,
        representativeHash: hashPayload(dnisRepresentative),
        payload: {
          representative: dnisRepresentative,
          groupedSegmentCount: rows.length,
        } as Record<string, unknown>,
      }
    })
    .filter((value): value is LogicalCall => value !== null)
}
