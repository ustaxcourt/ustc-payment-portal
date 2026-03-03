import * as React from 'react'
import { Box, Typography, Grid } from '@mui/material'
import StatusTabs from '../components/StatusTabs'
import TransactionsTable from '../components/TransactionsTable'
import { mockTransactions } from '../mock'
import type { Transaction, TransactionStatus } from '../types'

type TabsValue = TransactionStatus | 'ALL'

export default function TransactionLogPage() {
  // In real app you’ll fetch; for now use mocks
  const [statusTab, setStatusTab] = React.useState<TabsValue>('SUCCESS')

  // Derive counts for the tabs
  const counts = React.useMemo(() => {
    const base = { SUCCESS: 0, FAILED: 0, PENDING: 0 } as Record<TransactionStatus, number>
    for (const t of mockTransactions) base[t.status]++
    return base
  }, [])

  // Filter rows by selected tab
  const rows: Transaction[] = React.useMemo(() => {
    if (statusTab === 'ALL') return mockTransactions
    return mockTransactions.filter((t) => t.status === statusTab)
  }, [statusTab])

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 3, fontWeight: 700, textAlign: 'left' }}>
        Transaction Log
      </Typography>

      <Grid>
        <StatusTabs
          value={statusTab}
          counts={counts}
          onChange={setStatusTab}
        />

        <TransactionsTable rows={rows} />
      </Grid>
    </Box>
  )
}
