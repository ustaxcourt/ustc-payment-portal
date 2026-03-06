import * as React from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Box, Typography } from '@mui/material'
import FinanceDashboardHeader from '../../../components/FinanceDashboardHeader'
import StatusTabs from '../components/StatusTabs'
import { mockTransactions } from '../mock'
import type { PaymentStatus } from '../types'

const isPaymentStatus = (value: string): value is PaymentStatus => {
  return value === 'success' || value === 'failed' || value === 'pending'
}

export default function TransactionsLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // Derive the current status value from the URL
  const currentTab: PaymentStatus = React.useMemo(() => {
    const seg = pathname.split('/').pop() || ''
    return isPaymentStatus(seg) ? seg : 'success'
  }, [pathname])

  // Compute counts for chips (replace with API counts later if you prefer)
  const counts = React.useMemo(() => {
    return mockTransactions.reduce(
      (acc, t) => {
        acc[t.paymentStatus]++
        return acc
      },
      { success: 0, failed: 0, pending: 0 } as Record<PaymentStatus, number>
    )
  }, [])

  // When the tab changes, navigate to the corresponding child route
  const handleTabChange = (value: PaymentStatus) => {
    navigate(value)
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
