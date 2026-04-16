import { versatureFetch } from './client'
import type { VersatureCdr } from './types'

export interface GetCdrsForUsersOptions {
  pageLimit?: number
  pauseMs?: number
}

export async function getCdrsForUsers(
  userIds: string[],
  startDate: string,
  endDate: string,
  options: GetCdrsForUsersOptions = {},
): Promise<VersatureCdr[]> {
  const { pageLimit = 500, pauseMs = 3000 } = options
  const all: VersatureCdr[] = []

  for (const userId of userIds) {
    let page = 1
    while (true) {
      try {
        const data = (await versatureFetch(
          `/cdrs/users/?to.user=${encodeURIComponent(userId)}` +
            `&start_date=${startDate}&end_date=${endDate}` +
            `&limit=${pageLimit}&page=${page}`,
        )) as VersatureCdr[]

        if (!Array.isArray(data) || data.length === 0) break
        all.push(...data)
        if (data.length < pageLimit) break
        if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs))
        page++
      } catch (err) {
        console.warn(`[cdrs-users] Fetch failed for user ${userId} page ${page}:`, err)
        break
      }
    }
  }

  return all
}
