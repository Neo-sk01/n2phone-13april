import { getAccessToken, invalidateAccessToken } from './auth'

class UnauthorizedOnceError extends Error {}
class RateLimitedError extends Error {}

function buildHeaders(token: string) {
  return {
    Accept: process.env.VERSATURE_API_VERSION ?? 'application/vnd.integrate.v1.6.0+json',
    Authorization: `Bearer ${token}`,
  }
}

export function extractPagedItems<T>(payload: unknown): {
  items: T[]
  more: boolean
  cursor: string | null
} {
  if (Array.isArray(payload)) {
    return { items: payload as T[], more: false, cursor: null }
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Versature page payload was not an object or array')
  }

  const page = payload as {
    result?: T[]
    results?: T[]
    cdrs?: T[]
    more?: boolean
    cursor?: string | null
  }

  if (Array.isArray(page.result)) {
    return { items: page.result, more: Boolean(page.more), cursor: page.cursor ?? null }
  }

  if (Array.isArray(page.results)) {
    return { items: page.results, more: Boolean(page.more), cursor: page.cursor ?? null }
  }

  if (Array.isArray(page.cdrs)) {
    return { items: page.cdrs, more: Boolean(page.more), cursor: page.cursor ?? null }
  }

  throw new Error('Unable to find a row array in the Versature page payload')
}

export async function versatureFetch(path: string) {
  const url = `${process.env.VERSATURE_BASE_URL}${path}`

  async function attempt() {
    const token = await getAccessToken()
    const response = await fetch(url, { headers: buildHeaders(token) })

    if (response.ok) {
      return response.json()
    }

    if (response.status === 429) {
      throw new RateLimitedError(`429 from ${path}`)
    }

    if (response.status === 401) {
      throw new UnauthorizedOnceError(`401 from ${path}`)
    }

    throw new Error(`Versature request failed (${response.status}) for ${path}`)
  }

  for (let tries = 0; tries < 5; tries++) {
    try {
      return await attempt()
    } catch (error) {
      if (error instanceof RateLimitedError) {
        const delay = Math.min(2000 * Math.pow(2, tries), 30000)
        console.log(`Rate limited on ${path}, waiting ${delay / 1000}s (attempt ${tries + 1}/5)…`)
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      if (error instanceof UnauthorizedOnceError) {
        invalidateAccessToken()
        try {
          return await attempt()
        } catch (retryError) {
          if (retryError instanceof UnauthorizedOnceError) {
            throw new Error(`Versature request returned 401 twice for ${path}`)
          }
          throw retryError
        }
      }
      throw error
    }
  }

  throw new Error(`Versature request rate-limited too many times for ${path}`)
}

export async function fetchAllPages<T>(path: string) {
  const rows: T[] = []
  let cursor: string | null = null

  while (true) {
    const query = cursor ? `${path}&cursor=${encodeURIComponent(cursor)}` : path
    const payload = await versatureFetch(query)
    const page = extractPagedItems<T>(payload)
    rows.push(...page.items)

    if (!page.more) {
      return rows
    }

    cursor = page.cursor
  }
}
