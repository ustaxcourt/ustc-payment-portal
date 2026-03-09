import { useFetch } from '../../../lib/hooks/useFetch'
import { fetchTransactionsByStatus } from '../api/transactions.api'
import type { TransactionsResponse } from '../api/transactions.api'
import type { PaymentStatus } from '../types'

export function useTransactionsByStatus(status: PaymentStatus) {
  return useFetch<TransactionsResponse>(
    (signal) => fetchTransactionsByStatus(status, { signal }),
    [status]
  )
}
