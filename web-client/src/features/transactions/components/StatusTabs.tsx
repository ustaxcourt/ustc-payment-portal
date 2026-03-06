import * as React from 'react'
import { Tabs, Tab, Box } from '@mui/material'
import type { PaymentStatus } from '../types'
import { StatusChip } from './StatusChip'

export interface StatusTabsProps {
  value: PaymentStatus
  counts: Record<PaymentStatus, number>
  onChange: (value: PaymentStatus) => void
}

export default function StatusTabs({ value, counts, onChange }: StatusTabsProps) {
  const handleChange = (_: React.SyntheticEvent, newValue: PaymentStatus) => {
    onChange(newValue)
  }

  return (
    <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 0 }}>
      <Tabs
        value={value}
        onChange={handleChange}
        variant="fullWidth"
        allowScrollButtonsMobile
        aria-label="Transaction status tabs"
      >
        <Tab
          value="success"
          label={
            <Box display="flex" alignItems="center" gap={1}>
              Successful <StatusChip status="success" label={counts.success} />
            </Box>
          }
        />
        <Tab
          value="failed"
          label={
            <Box display="flex" alignItems="center" gap={1}>
              Failed <StatusChip status="failed" label={counts.failed} />
            </Box>
          }
        />
        <Tab
          value="pending"
          label={
            <Box display="flex" alignItems="center" gap={1}>
              Pending <StatusChip status="pending" label={counts.pending} />
            </Box>
          }
        />
      </Tabs>
    </Box>
  )
}
