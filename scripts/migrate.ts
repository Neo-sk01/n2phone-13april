import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { getPool } from '../lib/db/client'

async function main() {
  const pool = getPool()
  const migrationsDir = join(process.cwd(), 'db/migrations')
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const sql = await readFile(join(migrationsDir, file), 'utf8')
    await pool.query(sql)
    console.log(`Applied migration ${file}`)
  }

  await pool.end()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
