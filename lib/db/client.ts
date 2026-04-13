import { Pool } from 'pg'

declare global {
  var __cshPool: Pool | undefined
}

export function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required')
  }

  global.__cshPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
  })

  return global.__cshPool
}
