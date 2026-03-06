import { useFetch } from '../../../lib/hooks/useFetch'
import { fetchTransactionsByStatus } from '../api/transactions.api'
import type { PaymentStatus, Transaction } from '../types'

export function useTransactionsByStatus(status: PaymentStatus) {
  return useFetch<Transaction[]>(
    (signal) => fetchTransactionsByStatus(status, { signal }),
    [status]
  )
}
