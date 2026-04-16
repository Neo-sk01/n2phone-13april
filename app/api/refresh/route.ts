import { eachDayOfInterval } from 'date-fns'
import { NextRequest, NextResponse } from 'next/server'
import { syncDay } from '@/lib/versature/sync'
import { toTorontoDateString } from '@/lib/utils/dates'

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? ''
  // Default to "today" in Toronto, not UTC. slice(0,10) of a UTC ISO is off
  // by one from roughly 19:00 EST / 20:00 EDT onward.
  let startDate = toTorontoDateString(new Date())
  let endDate = startDate

  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({}))
    startDate = body.startDate ?? body.date ?? startDate
    endDate = body.endDate ?? body.date ?? endDate
  } else {
    const formData = await request.formData().catch(() => null)
    startDate = String(formData?.get('startDate') ?? formData?.get('date') ?? startDate)
    endDate = String(formData?.get('endDate') ?? formData?.get('date') ?? endDate)
  }

  try {
    for (const day of eachDayOfInterval({
      start: new Date(`${startDate}T12:00:00`),
      end: new Date(`${endDate}T12:00:00`),
    })) {
      await syncDay(day)
    }

    return NextResponse.json({ ok: true, startDate, endDate })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Refresh failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
