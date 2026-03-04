// src/pages/TransactionsStatusPage.tsx
import * as React from 'react'
import TransactionsTable from '../components/TransactionsTable'
import type { Transaction, TransactionStatus } from '../types'
import { fetchTransactionsByStatus } from '../api/transactions.api'

export default function TransactionsStatusPage({ status }: { status: TransactionStatus }) {
  const [rows, setRows] = React.useState<Transaction[]>([])
  const [loading, setLoading] = React.useState<boolean>(false)

  React.useEffect(() => {
    const ac = new AbortController()
    setLoading(true)

    fetchTransactionsByStatus(status, { signal: ac.signal, latencyMs: 250 })
      .then((data) => setRows(data))
      .catch((err) => {
        // Swallow aborts, log real errors
        if (err?.name !== 'AbortError') {
          console.error('fetchTransactionsByStatus error:', err)
          setRows([]) // or keep previous rows
        }
      })
      .finally(() => setLoading(false))

    return () => ac.abort()
  }, [status])

  return <TransactionsTable rows={rows} loading={loading} status={status} />
}
