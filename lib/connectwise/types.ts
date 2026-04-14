export type ConnectWiseTicket = {
  id: number
  summary?: string
  dateEntered?: string
  contact?: { phoneNumber?: string }
  source?: { id?: number }
  [key: string]: unknown
}
