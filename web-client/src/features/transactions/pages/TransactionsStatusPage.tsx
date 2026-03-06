import * as React from 'react'
import TransactionsTable from '../components/TransactionsTable'
import type { TransactionStatus } from '../types'
import { useTransactionsByStatus } from '../hooks/useTransactionByStatus'

export default function TransactionsStatusPage({ status }: { status: TransactionStatus }): React.ReactElement {
  const { data, loading, error } = useTransactionsByStatus(status)

  return (
    <TransactionsTable
      rows={data ?? []}
      loading={loading}
      status={status}
      error={error}
    />
  )
}
