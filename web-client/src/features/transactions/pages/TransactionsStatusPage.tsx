import * as React from 'react'
import { useOutletContext } from 'react-router-dom'
import TransactionsTable from '../components/TransactionsTable'
import type { TabStatus } from '../types'
import type { TransactionsLayoutContext } from './TransactionsLayout'

export default function TransactionsStatusPage({ status }: { status: TabStatus }): React.ReactElement {
  const { rows, loading, error } = useOutletContext<TransactionsLayoutContext>()

  return (
    <TransactionsTable
      rows={rows}
      loading={loading}
      status={status}
      error={error}
    />
  )
}
