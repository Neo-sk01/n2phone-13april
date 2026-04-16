export const TARGET_DNIS = [
  process.env.DNIS_PRIMARY!,
  process.env.DNIS_SECONDARY!,
] as const

function stripPrefix(value: string | undefined) {
  return (value ?? '').replace(/^\+/, '')
}

export function isDnisMatch(value: string) {
  const normalized = stripPrefix(value)
  return TARGET_DNIS.some((dnis) => stripPrefix(dnis) === normalized)
}

export function filterToTargetDnis<T extends Record<string, unknown>>(
  rows: T[],
  field: keyof T,
) {
  return rows.filter((row) => isDnisMatch(String(row[field])))
}
