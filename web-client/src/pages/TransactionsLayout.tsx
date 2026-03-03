// src/features/transactions/pages/TransactionsLayout.tsx
import * as React from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Box, Typography } from '@mui/material'
import FinanceDashboardHeader from '../components/FinanceDashboardHeader'
import StatusTabs from '../features/transactions/components/StatusTabs'
import { mockTransactions } from '../features/transactions/mock'
import type { TransactionStatus } from '../features/transactions/types'

type StatusTabsValue = TransactionStatus // we won't use 'ALL' in the routed version

// Map route segment <-> domain status
const pathToStatus: Record<string, StatusTabsValue | undefined> = {
  successful: 'SUCCESS',
  failed: 'FAILED',
  pending: 'PENDING',
}
const statusToPath: Record<StatusTabsValue, string> = {
  SUCCESS: 'successful',
  FAILED: 'failed',
  PENDING: 'pending',
}

export default function TransactionsLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // Derive the current status value from the URL
  const currentTab: StatusTabsValue = React.useMemo(() => {
    const seg = pathname.split('/').pop() || ''
    return pathToStatus[seg] ?? 'SUCCESS'
  }, [pathname])

  // Compute counts for chips (replace with API counts later if you prefer)
  const counts = React.useMemo(() => {
    return mockTransactions.reduce(
      (acc, t) => {
        acc[t.status]++
        return acc
      },
      { SUCCESS: 0, FAILED: 0, PENDING: 0 } as Record<TransactionStatus, number>
    )
  }, [])

  // When the tab changes, navigate to the corresponding child route
  const handleTabChange = (value: StatusTabsValue) => {
    navigate(statusToPath[value]) // relative to /transactions
  }

  return (
    <Box>
      <FinanceDashboardHeader />

      <Box sx={{ m: 2 }}>
        <Typography variant="h6" sx={{ my: 2, fontWeight: 700 }}>
          Transaction Log
        </Typography>

        <StatusTabs
          value={currentTab}
          counts={counts}
          onChange={handleTabChange}
        />

        <Outlet />
      </Box>
    </Box >
  )
}
``
