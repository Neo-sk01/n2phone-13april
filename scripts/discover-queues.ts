import { listQueues } from '../lib/versature/endpoints'

async function main() {
  const queues = await listQueues()
  console.table(queues.map((queue) => ({ id: queue.id, description: queue.description })))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
