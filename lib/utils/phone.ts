export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = String(raw).split(/[x;]/i)[0]
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 10) return `1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return digits
  return null
}
