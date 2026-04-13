export const TARGET_DNIS = [
  process.env.DNIS_PRIMARY!,
  process.env.DNIS_SECONDARY!,
] as const

export const ENGLISH_QUEUE_ID = process.env.QUEUE_ENGLISH!
export const FRENCH_QUEUE_ID = process.env.QUEUE_FRENCH!
export const AI_OVERFLOW_QUEUE_IDS = [
  process.env.QUEUE_AI_OVERFLOW_EN!,
  process.env.QUEUE_AI_OVERFLOW_FR!,
] as const
