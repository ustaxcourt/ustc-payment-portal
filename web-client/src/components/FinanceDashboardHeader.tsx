import * as React from 'react'
import { Box, Divider, Typography } from '@mui/material'

export interface FinanceDashboardHeaderProps {
  title?: string
  subtitle?: string
  rightContent?: React.ReactNode
  dividerThickness?: number  // still supported as an override
}

export default function FinanceDashboardHeader({
  title = 'Payment Portal',
  subtitle = '',
  rightContent,
  dividerThickness, // optional override
}: FinanceDashboardHeaderProps) {
  return (
    <Box component="header">
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: rightContent ? '1fr auto' : '1fr',
          alignItems: 'center',
          columnGap: 2,
          rowGap: 2,
        }}
      >
        <Box sx={{ m: 2 }}>
          <Typography variant="h4" component="h1">
            {title}
          </Typography>
          <Typography variant="h5" component="p" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        </Box>

        {rightContent ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minWidth: 0 }}>
            {rightContent}
          </Box>
        ) : null}
      </Box>

      <Divider
        variant="fullWidth"
        sx={(_theme) => ({
          ...(dividerThickness ? { borderBottomWidth: dividerThickness } : {}),
          borderTop: 'none',
        })}
      />
    </Box>
  )
}
