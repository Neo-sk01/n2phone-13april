export type ConnectWiseTicket = {
  id: number
  summary?: string
  dateEntered?: string
  contact?: { phoneNumber?: string }
  source?: { id?: number }
  status?: { name?: string }
  resolvedDateTime?: string
  mergedIntoTicket?: { id?: number }
  closedFlag?: boolean
  [key: string]: unknown
}
