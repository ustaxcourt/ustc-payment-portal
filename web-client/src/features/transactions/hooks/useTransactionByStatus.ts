import { useFetch } from '../../../lib/hooks/useFetch'
import { fetchTransactionsByStatus, fetchAllTransactions } from '../api/transactions.api'
import type { TransactionsResponse } from '../api/transactions.api'
import type { PaymentStatus, TabStatus } from '../types'

export function useTransactionsByStatus(status: PaymentStatus) {
  return useFetch<TransactionsResponse>(
    (signal) => fetchTransactionsByStatus(status, { signal }),
    [status]
  )
}

/** Unified hook that handles both the 'all' aggregate tab and the per-status tabs. */
export function useTransactionsByTab(tab: TabStatus) {
  return useFetch<TransactionsResponse>(
    (signal) =>
      tab === 'all'
        ? fetchAllTransactions({ signal })
        : fetchTransactionsByStatus(tab, { signal }),
    [tab]
  )
}
