export function formatDuration(seconds: number) {
  const whole = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(whole / 60)
  const remainder = whole % 60
  return `${minutes}m ${remainder}s`
}

export function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}
