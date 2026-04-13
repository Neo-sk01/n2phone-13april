type TokenState = {
  token: string
  expiresAt: number
}

let state: TokenState | null = null

export function invalidateAccessToken() {
  state = null
}

export async function getAccessToken() {
  if (state && Date.now() < state.expiresAt) {
    return state.token
  }

  const response = await fetch(`${process.env.VERSATURE_BASE_URL}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.VERSATURE_CLIENT_ID!,
      client_secret: process.env.VERSATURE_CLIENT_SECRET!,
    }),
  })

  if (!response.ok) {
    throw new Error(`Versature token request failed: ${response.status}`)
  }

  const payload = await response.json()
  console.log(`Versature OAuth scope: ${payload.scope}`)

  state = {
    token: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in - 60) * 1000,
  }

  return state.token
}
