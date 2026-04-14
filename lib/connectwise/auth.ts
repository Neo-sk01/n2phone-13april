export function buildConnectWiseHeaders() {
  const companyId = process.env.CONNECTWISE_COMPANY_ID!
  const publicKey = process.env.CONNECTWISE_PUBLIC_KEY!
  const privateKey = process.env.CONNECTWISE_PRIVATE_KEY!
  const clientId = process.env.CONNECTWISE_CLIENT_ID!

  const credentials = Buffer.from(`${companyId}+${publicKey}:${privateKey}`).toString('base64')

  return {
    Authorization: `Basic ${credentials}`,
    'Content-Type': 'application/json',
    clientId,
  }
}
