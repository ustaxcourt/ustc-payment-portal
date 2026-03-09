import * as React from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Box, Typography } from '@mui/material'
import FinanceDashboardHeader from '../../../components/FinanceDashboardHeader'
import StatusTabs from '../components/StatusTabs'
import { useFetch } from '../../../lib/hooks/useFetch'
import { useTransactionsByStatus } from '../hooks/useTransactionByStatus'
import { fetchTransactionPaymentStatus } from '../api/transactions.api'
import type { PaymentStatus } from '../types'
import type { Transaction } from '../types'

export interface TransactionsLayoutContext {
  status: PaymentStatus
  rows: Transaction[]
  total: number
  loading: boolean
  error: Error | null
}

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

  const { data, loading, error } = useTransactionsByStatus(currentTab)
  const { data: initialCounts } = useFetch(
    (signal) => fetchTransactionPaymentStatus({ signal }),
    []
  )

  const [counts, setCounts] = React.useState<Record<PaymentStatus, number>>({
    success: 0,
    failed: 0,
    pending: 0,
  })

  const hasInitializedCounts = React.useRef(false)

  // Initialize the counts when the initial data is fetched
  React.useEffect(() => {
    if (!initialCounts || hasInitializedCounts.current) {
      return
    }

    setCounts(initialCounts)
    hasInitializedCounts.current = true
  }, [initialCounts])

  // Update the counts when the data changes
  React.useEffect(() => {
    if (typeof data?.total !== 'number') {
      return
    }

    setCounts((prev) => {
      if (prev[currentTab] === data.total) {
        return prev
      }

      return {
        ...prev,
        [currentTab]: data.total,
      }
    })
  }, [currentTab, data?.total])

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

        <Outlet
          context={{
            status: currentTab,
            rows: data?.data ?? [],
            total: data?.total ?? 0,
            loading,
            error,
          } satisfies TransactionsLayoutContext}
        />
      </Box>
    </Box >
  )
}
