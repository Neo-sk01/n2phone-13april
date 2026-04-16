import { buildConnectWiseHeaders } from './auth'
import type { ConnectWiseTicket } from './types'

const PAGE_SIZE = 100
const FIELDS = [
  'id',
  'summary',
  'dateEntered',
  'contact/phoneNumber',
  'source/id',
  'status/name',
  'resolvedDateTime',
  'mergedIntoTicket/id',
  'closedFlag',
].join(',')

export async function fetchTickets(
  startDate: string,
  endDate: string,
): Promise<ConnectWiseTicket[]> {
  const baseUrl = process.env.CONNECTWISE_BASE_URL!
  const sourceId = process.env.CONNECTWISE_SOURCE_ID!
  const headers = buildConnectWiseHeaders()

  const conditions = `dateEntered >= [${startDate}] AND dateEntered <= [${endDate}] AND source/id=${sourceId}`
  const tickets: ConnectWiseTicket[] = []
  let page = 1

  while (true) {
    const url =
      `${baseUrl}/service/tickets` +
      `?conditions=${encodeURIComponent(conditions)}` +
      `&fields=${encodeURIComponent(FIELDS)}` +
      `&pageSize=${PAGE_SIZE}&page=${page}`

    const response = await fetch(url, { headers })

    if (!response.ok) {
      // Fail closed. Silently returning a partial list would let downstream
      // code (runner.ts full-replace) delete valid correlations and rebuild
      // from an incomplete ticket set. The caller is expected to catch this
      // and mark the month as degraded rather than trust partial data.
      throw new Error(
        `[connectwise] fetchTickets failed on page ${page}: ` +
          `${response.status} ${response.statusText}`,
      )
    }

    const data = (await response.json()) as ConnectWiseTicket[]

    if (data.length === 0) {
      break
    }

    tickets.push(...data)

    if (data.length < PAGE_SIZE) {
      break
    }

    page++
  }

  return tickets
}
