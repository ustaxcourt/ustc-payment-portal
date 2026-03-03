import * as React from 'react'
import TransactionsTable from '../features/transactions/components/TransactionsTable'
import { mockTransactions } from '../features/transactions/mock'
import type { TransactionStatus } from '../features/transactions/types'

export default function TransactionsStatusPage({ status }: { status: TransactionStatus }) {
  const rows = React.useMemo(
    () => mockTransactions.filter((t) => t.status === status),
    [status]
  )

  const callTransaction = (status: string) => {
    console.log('status', status)
    return fetch('url/path')
      .then(() => mockTransactions)
      .catch(() => mockTransactions)
  }

  React.useEffect(() => {
    callTransaction(status);
  }, [])


  return (
    <TransactionsTable rows={rows} status={status} />
  )
}
