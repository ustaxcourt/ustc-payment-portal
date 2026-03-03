export type TransactionStatus = 'SUCCESS' | 'FAILED' | 'PENDING'

export type Transaction = {
  id: string
  timestamp: string // ISO string
  feeType: string
  amount: number
  payType: string
  accountHolder: string
  agencyId: string
  status: TransactionStatus
}
