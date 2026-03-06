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
          value="SUCCESS"
          label={
            <Box display="flex" alignItems="center" gap={1}>
              Successful <StatusChip status="SUCCESS" label={counts.SUCCESS} />
            </Box>
          }
        />
        <Tab
          value="FAILED"
          label={
            <Box display="flex" alignItems="center" gap={1}>
              Failed <StatusChip status="FAILED" label={counts.FAILED} />
            </Box>
          }
        />
        <Tab
          value="PENDING"
          label={
            <Box display="flex" alignItems="center" gap={1}>
              Pending <StatusChip status="PENDING" label={counts.PENDING} />
            </Box>
          }
        />
      </Tabs>
    </Box>
  )
}
