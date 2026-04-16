export interface CallForCorrelation {
  cdrId: string
  normalizedPhone: string | null
  startTime: Date
}

export interface TicketForCorrelation {
  id: number
  normalizedPhone: string | null
  dateEntered: Date | null
}

export type Confidence = 'exact' | 'fuzzy' | 'none'

export interface CorrelationResult {
  ticketId: number | null
  confidence: Confidence
  reason: string
}

const EXACT_WINDOW_BEFORE_MS = 5 * 60_000
const EXACT_WINDOW_AFTER_MS = 30 * 60_000
const FUZZY_WINDOW_BEFORE_MS = 60 * 60_000
const FUZZY_WINDOW_AFTER_MS = 4 * 60 * 60_000

export function correlateCall(
  call: CallForCorrelation,
  tickets: TicketForCorrelation[],
): CorrelationResult {
  if (!call.normalizedPhone) {
    return { ticketId: null, confidence: 'none', reason: 'call missing phone' }
  }

  const candidates = tickets.filter(
    (t) => t.normalizedPhone === call.normalizedPhone && t.dateEntered != null,
  )
  if (candidates.length === 0) {
    return { ticketId: null, confidence: 'none', reason: 'no ticket with matching phone' }
  }

  const callMs = call.startTime.getTime()
  let bestExact: { ticket: TicketForCorrelation; delta: number } | null = null
  let bestFuzzy: { ticket: TicketForCorrelation; delta: number } | null = null

  for (const t of candidates) {
    const delta = t.dateEntered!.getTime() - callMs
    const abs = Math.abs(delta)
    if (delta >= -EXACT_WINDOW_BEFORE_MS && delta <= EXACT_WINDOW_AFTER_MS) {
      if (!bestExact || abs < Math.abs(bestExact.delta)) bestExact = { ticket: t, delta }
    } else if (delta >= -FUZZY_WINDOW_BEFORE_MS && delta <= FUZZY_WINDOW_AFTER_MS) {
      if (!bestFuzzy || abs < Math.abs(bestFuzzy.delta)) bestFuzzy = { ticket: t, delta }
    }
  }

  if (bestExact) {
    return {
      ticketId: bestExact.ticket.id,
      confidence: 'exact',
      reason: `Δ ${Math.round(bestExact.delta / 60000)}m within exact window`,
    }
  }
  if (bestFuzzy) {
    return {
      ticketId: bestFuzzy.ticket.id,
      confidence: 'fuzzy',
      reason: `Δ ${Math.round(bestFuzzy.delta / 60000)}m within fuzzy window`,
    }
  }
  return { ticketId: null, confidence: 'none', reason: 'phone matched but no time-window match' }
}
