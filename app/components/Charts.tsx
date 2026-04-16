'use client'

import dynamic from 'next/dynamic'

export const LanguageSplitChart = dynamic(
  () => import('./LanguageSplitChart').then((m) => ({ default: m.LanguageSplitChart })),
  { ssr: false },
)

export const HourlyDurationChart = dynamic(
  () => import('./HourlyDurationChart').then((m) => ({ default: m.HourlyDurationChart })),
  { ssr: false },
)

export const DayOfWeekChart = dynamic(
  () => import('./DayOfWeekChart').then((m) => ({ default: m.DayOfWeekChart })),
  { ssr: false },
)

export const SlaComplianceChart = dynamic(
  () => import('./SlaComplianceChart').then((m) => ({ default: m.SlaComplianceChart })),
  { ssr: false },
)
