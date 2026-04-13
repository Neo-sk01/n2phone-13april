import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}))
  const month = (body as { month?: string }).month

  const jobRunnerUrl = process.env.JOB_RUNNER_URL ?? 'http://localhost:3001'
  const url = month ? `${jobRunnerUrl}/run?month=${month}` : `${jobRunnerUrl}/run`

  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(10 * 60 * 1000),
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    console.error('[monthly-pull] Job runner unreachable:', err)
    return NextResponse.json(
      { status: 'error', error: 'Job runner unavailable' },
      { status: 503 },
    )
  }
}
