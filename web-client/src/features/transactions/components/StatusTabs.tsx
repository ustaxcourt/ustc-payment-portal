import * as React from 'react'
import { Tabs, Tab, Box } from '@mui/material'
import type { TransactionStatus } from '../types'
import { StatusChip } from './StatusChip'

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
