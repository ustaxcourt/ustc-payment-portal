import * as React from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Box, Typography } from '@mui/material'
import FinanceDashboardHeader from '../../../components/FinanceDashboardHeader'
import StatusTabs from '../components/StatusTabs'
import { useFetch } from '../../../lib/hooks/useFetch'
import { useTransactionsByTab } from '../hooks/useTransactionByStatus'
import { fetchTransactionPaymentStatus } from '../api/transactions.api'
import type { PaymentStatus, TabStatus } from '../types'
import type { Transaction } from '../types'

export interface TransactionsLayoutContext {
  status: TabStatus
  rows: Transaction[]
  total: number
  loading: boolean
  error: Error | null
}

const isTabStatus = (value: string): value is TabStatus => {
  return value === 'all' || value === 'success' || value === 'failed' || value === 'pending'
}

export default function TransactionsLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // Derive the current tab value from the URL
  const currentTab: TabStatus = React.useMemo(() => {
    const seg = pathname.split('/').pop() || ''
    return isTabStatus(seg) ? seg : 'all'
  }, [pathname])

  const { data, loading, error } = useTransactionsByTab(currentTab)
  const { data: initialCounts } = useFetch(
    (signal) => fetchTransactionPaymentStatus({ signal }),
    []
  )

  const [counts, setCounts] = React.useState<Record<TabStatus, number>>({
    all: 0,
    success: 0,
    failed: 0,
    pending: 0,
  })

  const hasInitializedCounts = React.useRef(false)

  // Initialize the per-status counts when the initial data is fetched
  React.useEffect(() => {
    if (!initialCounts || hasInitializedCounts.current) {
      return
    }

    setCounts((prev) => ({
      ...prev,
      success: initialCounts.success,
      failed: initialCounts.failed,
      pending: initialCounts.pending,
    }))
    hasInitializedCounts.current = true
  }, [initialCounts])

  // Update the count for the active tab whenever data changes
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
  const handleTabChange = (value: TabStatus) => {
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
