export type QueueId = 'english' | 'french' | 'ai-overflow-en' | 'ai-overflow-fr'

export type CdrSegmentRow = {
  sourceHash: string
  externalId: string | null
  callType: string | null
  startTime: string
  answerTime: string | null
  endTime: string
  durationSeconds: number
  fromNumber: string | null
  fromName: string | null
  fromUser: string | null
  toId: string | null
  payload: Record<string, unknown>
}

export type LogicalCallRow = {
  callDate: string
  dedupeKey: string
  callerNumber: string | null
  dnis: string
  startTime: string
  endTime: string
  answered: boolean
  durationSeconds: number
  representativeHash: string
  payload: Record<string, unknown>
}
