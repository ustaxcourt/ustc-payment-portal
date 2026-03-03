import * as React from 'react'
import TransactionsTable from '../components/TransactionsTable'
import { mockTransactions } from '../mock'
import type { TransactionStatus } from '../types'

export default function TransactionsStatusPage({ status }: { status: TransactionStatus }) {
  const rows = React.useMemo(
    () => mockTransactions.filter((t) => t.status === status),
    [status]
  )

  return (
    <TransactionsTable rows={rows} status={status} />
  )
}
