import { useFetch } from '../../../lib/hooks/useFetch'
import { fetchTransactionsByStatus } from '../api/transactions.api'
import type { Transaction, TransactionStatus } from '../types'

export function useTransactionsByStatus(status: TransactionStatus) {
  return useFetch<Transaction[]>(
    (signal) => fetchTransactionsByStatus(status, { signal, latencyMs: 250 }),
    [status]
  )
}
