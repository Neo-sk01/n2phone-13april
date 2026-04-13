'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatInTimeZone } from 'date-fns-tz'
import { subMonths, startOfMonth } from 'date-fns'

type PullStatus =
  | { status: 'not_pulled'; month: string }
  | { status: 'in_progress'; month: string; startedAt?: string }
  | { status: 'completed' | 'already_pulled'; month: string; pulledAt?: string; recordCounts?: { cdrs: number; queueStats: number; tickets: number } }
  | { status: 'failed'; month: string; error?: string }

function getPreviousMonth(): string {
  return formatInTimeZone(startOfMonth(subMonths(new Date(), 1)), 'America/Toronto', 'yyyy-MM')
}

function formatMonthLabel(month: string): string {
  const [year, mo] = month.split('-').map(Number)
  return new Date(year, mo - 1, 1).toLocaleDateString('en-CA', {
    month: 'short',
    year: 'numeric',
  })
}

export function PullDataButton() {
  const [targetMonth, setTargetMonth] = useState(getPreviousMonth)
  const [pullStatus, setPullStatus] = useState<PullStatus | null>(null)
  const [elapsed, setElapsed] = useState(0)

  const checkStatus = useCallback((month: string) => {
    fetch(`/api/jobs/monthly-pull/status?month=${month}`)
      .then((r) => r.json())
      .then(setPullStatus)
      .catch(() => setPullStatus({ status: 'not_pulled', month }))
  }, [])

  useEffect(() => {
    checkStatus(targetMonth)
  }, [targetMonth, checkStatus])

  // Poll every 5 seconds while in_progress
  useEffect(() => {
    if (pullStatus?.status !== 'in_progress') {
      setElapsed(0)
      return
    }
    const interval = setInterval(() => {
      setElapsed((e) => e + 5)
      checkStatus(targetMonth)
    }, 5000)
    return () => clearInterval(interval)
  }, [pullStatus?.status, targetMonth, checkStatus])

  const handlePull = useCallback(async () => {
    setPullStatus({ status: 'in_progress', month: targetMonth })
    setElapsed(0)
    try {
      const res = await fetch('/api/jobs/monthly-pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: targetMonth }),
      })
      const data = await res.json()
      setPullStatus(data)
    } catch {
      setPullStatus({ status: 'failed', month: targetMonth, error: 'Network error' })
    }
  }, [targetMonth])

  // Last 12 months for dropdown
  const monthOptions = Array.from({ length: 12 }, (_, i) =>
    formatInTimeZone(startOfMonth(subMonths(new Date(), i + 1)), 'America/Toronto', 'yyyy-MM'),
  )

  const label = formatMonthLabel(targetMonth)
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60

  if (pullStatus?.status === 'completed' || pullStatus?.status === 'already_pulled') {
    const pulledAt = pullStatus.pulledAt
      ? new Date(pullStatus.pulledAt).toLocaleString('en-CA', {
          timeZone: 'America/Toronto',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : ''
    return (
      <span className="text-xs text-slate-500">
        {label} pulled {pulledAt}
      </span>
    )
  }

  if (pullStatus?.status === 'in_progress') {
    return (
      <button
        disabled
        className="rounded-full border border-slate-300 bg-slate-100 px-4 py-2 text-sm text-slate-500"
      >
        Pulling... ({mins}m {secs}s)
      </button>
    )
  }

  if (pullStatus?.status === 'failed') {
    return (
      <button
        onClick={handlePull}
        className="rounded-full bg-red-600 px-4 py-2 text-sm text-white"
      >
        Pull failed — Retry?
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handlePull}
        disabled={pullStatus === null}
        className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
      >
        Pull {label} Data
      </button>
      <select
        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600"
        value={targetMonth}
        onChange={(e) => setTargetMonth(e.target.value)}
        aria-label="Select month to pull"
      >
        {monthOptions.map((m) => (
          <option key={m} value={m}>
            {formatMonthLabel(m)}
          </option>
        ))}
      </select>
    </div>
  )
}
