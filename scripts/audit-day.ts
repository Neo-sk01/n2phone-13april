import { getDashboardData } from '../lib/kpis/get-dashboard-data'

async function main() {
  const dateArg = process.argv[2]
  if (!dateArg) {
    throw new Error('Usage: npm run audit:day -- 2026-04-01')
  }

  const period = {
    start: new Date(`${dateArg}T00:00:00-04:00`),
    end: new Date(`${dateArg}T23:59:59-04:00`),
  }

  const data = await getDashboardData(period)

  console.table([
    {
      metric: 'Deduped DNIS calls',
      value: data.kpi1.primaryCount,
    },
    {
      metric: 'Queue-offered total',
      value: data.kpi1.queueCount,
    },
    {
      metric: 'Delta %',
      value: data.kpi1.deltaPct.toFixed(1),
    },
    {
      metric: 'Dropped calls',
      value: data.kpi2.totalDropped,
    },
    {
      metric: 'Short calls',
      value: data.shortCalls.totalShortCalls,
    },
  ])
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
