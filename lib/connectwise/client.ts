import { buildConnectWiseHeaders } from './auth'
import type { ConnectWiseTicket } from './types'

const PAGE_SIZE = 100

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
    const url = `${baseUrl}/service/tickets?conditions=${encodeURIComponent(conditions)}&pageSize=${PAGE_SIZE}&page=${page}`

    const response = await fetch(url, { headers })

    if (!response.ok) {
      console.warn(`[connectwise] Request failed (${response.status}) on page ${page} — stopping pagination`)
      break
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
