import http from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import cron from 'node-cron'
import { runMonthlyPull } from './pull'

export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'POST' && req.url?.startsWith('/run')) {
    const url = new URL(req.url, 'http://localhost')
    const month = url.searchParams.get('month') ?? undefined

    console.log(`[job-runner] Pull triggered for ${month ?? 'previous month'}`)

    try {
      const result = await runMonthlyPull(month)
      res.end(JSON.stringify(result))
    } catch (err) {
      res.statusCode = 500
      res.end(JSON.stringify({ status: 'failed', error: String(err) }))
    }
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.end(JSON.stringify({ ok: true }))
    return
  }

  res.statusCode = 404
  res.end(JSON.stringify({ error: 'Not found' }))
}

// Only start the server and cron when this is the main entry point
const isMain = typeof require !== 'undefined'
  ? require.main === module
  : process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')

if (isMain) {
  const server = http.createServer(handleRequest)
  server.listen(3001, () => {
    console.log('[job-runner] HTTP server listening on :3001')
  })

  // 00:00 on the 1st of every month (TZ=America/Toronto set in docker-compose.yml)
  cron.schedule('0 0 1 * *', async () => {
    console.log('[job-runner] Monthly cron triggered — starting pull…')
    const result = await runMonthlyPull()
    console.log('[job-runner] Monthly pull result:', JSON.stringify(result))
  })

  console.log('[job-runner] Scheduler active — fires at 00:00 Eastern on the 1st of each month')
}
