import { versatureFetch } from './client'
import type { QueueSplit, QueueStats, VersatureCdr } from './types'

const CDR_PAGE_LIMIT = 500

export async function getDomainCdrs(startDate: string, endDate: string) {
  const rows: VersatureCdr[] = []
  let page = 1

  while (true) {
    const data = await versatureFetch(
      `/cdrs/?start_date=${startDate}&end_date=${endDate}&limit=${CDR_PAGE_LIMIT}&page=${page}`,
    )

    if (!Array.isArray(data) || data.length === 0) {
      break
    }

    rows.push(...data)

    if (data.length < CDR_PAGE_LIMIT) {
      break
    }

    // Pace requests to avoid 429s
    await new Promise((r) => setTimeout(r, 2500))
    page++
  }

  return rows
}

export function getQueueStats(queueId: string, startDate: string, endDate: string) {
  return versatureFetch(
    `/call_queues/${queueId}/stats/?start_date=${startDate}&end_date=${endDate}`,
  ) as Promise<QueueStats>
}

export function getQueueSplits(
  queueId: string,
  startDate: string,
  endDate: string,
  period: 'hour' | 'day' | 'month',
) {
  return versatureFetch(
    `/call_queues/${queueId}/reports/splits/?start_date=${startDate}&end_date=${endDate}&period=${period}`,
  ) as Promise<QueueSplit[]>
}

export function listQueues() {
  return versatureFetch('/call_queues/') as Promise<Array<{ id: string; description: string }>>
}
