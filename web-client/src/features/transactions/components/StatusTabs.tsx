// src/features/transactions/components/StatusTabs.tsx
import * as React from 'react'
import { Tabs, Tab, Chip, Box } from '@mui/material'
import type { TransactionStatus } from '../types'

type StatusTabsValue = TransactionStatus

export interface StatusTabsProps {
  value: StatusTabsValue
  counts: Record<TransactionStatus, number>
  onChange: (value: StatusTabsValue) => void
}

export default function StatusTabs({ value, counts, onChange }: StatusTabsProps) {
  const handleChange = (_: React.SyntheticEvent, newValue: StatusTabsValue) => {
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
          value="COMPLETED"
          label={
            <Box display="flex" alignItems="center" gap={1}>
              Successful <Chip size="small" color="success" label={counts.COMPLETED} />
            </Box>
          }
        />
        <Tab
          value="FAILED"
          label={
            <Box display="flex" alignItems="center" gap={1}>
              Failed <Chip size="small" color="error" label={counts.FAILED} />
            </Box>
          }
        />
        <Tab
          value="PENDING"
          label={
            <Box display="flex" alignItems="center" gap={1}>
              Pending <Chip size="small" color="warning" label={counts.PENDING} />
            </Box>
          }
        />
      </Tabs>
    </Box>
  )
}
