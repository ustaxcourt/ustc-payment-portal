import * as React from 'react'
import { Tabs, Tab, Chip, Box } from '@mui/material'
import { alpha } from '@mui/material/styles'
import type { TransactionStatus } from '../types'

type StatusTabsValue = TransactionStatus | 'ALL'

export interface StatusTabsProps {
  value: StatusTabsValue
  counts: Record<TransactionStatus, number>
  onChange: (value: StatusTabsValue) => void
}

export default function StatusTabs({
  value,
  counts,
  onChange,
}: StatusTabsProps) {
  const handleChange = (_: React.SyntheticEvent, newValue: StatusTabsValue) => {
    onChange(newValue)
  }

  const tabSx = {
    textTransform: 'none',
    fontWeight: 600
  }

  const successBg = (theme: any) => ({
    bgcolor: alpha(theme.palette.success.light, 0.25),
    borderRadius: 1
  })
  const failedBg = (theme: any) => ({
    bgcolor: alpha(theme.palette.error.light, 0.25),
    borderRadius: 1
  })
  const pendingBg = (theme: any) => ({
    bgcolor: alpha(theme.palette.warning.light, 0.25),
    borderRadius: 1
  })

  return (
    <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
      <Tabs
        value={value}
        onChange={handleChange}
        variant="scrollable"
        allowScrollButtonsMobile
        aria-label="Transaction status tabs"
      >
        <Tab
          value="SUCCESS"
          label={
            <Box display="flex" alignItems="center" gap={1}>
              Successful
              <Chip size="small" color="success" label={counts.SUCCESS} />
            </Box>
          }
          sx={(theme) => ({ ...tabSx, ...(value === 'SUCCESS' ? successBg(theme) : {}) })}
        />
        <Tab
          value="FAILED"
          label={
            <Box display="flex" alignItems="center" gap={1}>
              Failed
              <Chip size="small" color="error" label={counts.FAILED} />
            </Box>
          }
          sx={(theme) => ({ ...tabSx, ...(value === 'FAILED' ? failedBg(theme) : {}) })}
        />
        <Tab
          value="PENDING"
          label={
            <Box display="flex" alignItems="center" gap={1}>
              Pending
              <Chip size="small" color="warning" label={counts.PENDING} />
            </Box>
          }
          sx={(theme) => ({ ...tabSx, ...(value === 'PENDING' ? pendingBg(theme) : {}) })}
        />
      </Tabs>
    </Box>
  )
}
