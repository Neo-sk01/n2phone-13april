import { describe, expect, test, vi, beforeEach } from 'vitest'

describe('buildConnectWiseHeaders', () => {
  beforeEach(() => {
    vi.stubEnv('CONNECTWISE_COMPANY_ID', 'testco')
    vi.stubEnv('CONNECTWISE_PUBLIC_KEY', 'pub123')
    vi.stubEnv('CONNECTWISE_PRIVATE_KEY', 'priv456')
    vi.stubEnv('CONNECTWISE_CLIENT_ID', 'client-abc')
  })

  test('builds Basic auth from company+public:private and includes clientId', async () => {
    const { buildConnectWiseHeaders } = await import('@/lib/connectwise/auth')
    const headers = buildConnectWiseHeaders()

    const expectedCredentials = Buffer.from('testco+pub123:priv456').toString('base64')
    expect(headers.Authorization).toBe(`Basic ${expectedCredentials}`)
    expect(headers.clientId).toBe('client-abc')
    expect(headers['Content-Type']).toBe('application/json')
  })
})
