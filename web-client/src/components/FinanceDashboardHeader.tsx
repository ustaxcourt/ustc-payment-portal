import * as React from 'react'
import { Box, Divider, Typography } from '@mui/material'

export interface FinanceDashboardHeaderProps {
  title?: string
  subtitle?: string
  rightContent?: React.ReactNode
  dividerThickness?: number
}

export default function FinanceDashboardHeader({
  title = 'Payment Portal',
  subtitle = 'Finance Dashboard',
  rightContent,
  dividerThickness = 6,
}: FinanceDashboardHeaderProps) {
  return (
    <Box component="header">
      {/* Top row: title/subtitle on the left, optional content on the right */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: rightContent ? '1fr auto' : '1fr',
          alignItems: 'center',
          columnGap: 2,
          rowGap: 2,
        }}
      >
        {/* Left block: Title + Subtitle */}
        <Box sx={{ m: 2 }}>
          <Typography
            variant="h4"
            component="h1"
            sx={{ fontWeight: 800, lineHeight: 1.1 }}
          >
            {title}
          </Typography>
          <Typography
            variant="h5"
            component="p"
            sx={(theme) => ({
              fontWeight: 800,
              lineHeight: 1.1,
              color: theme.palette.primary.main, // blue accent
              mt: 0.5,
            })}
          >
            {subtitle}
          </Typography>
        </Box>

        {/* Optional right block */}
        {rightContent ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              minWidth: 0,
            }}
          >
            {rightContent}
          </Box>
        ) : null}
      </Box>

      {/* Blue divider along the bottom */}
      <Divider
        variant="fullWidth"
        sx={() => ({
          borderColor: '#1a4480',
          borderBottomWidth: dividerThickness,
          // Ensure only the bottom border is visible (MUI Divider uses borderColor)
          borderTop: 'none',
        })}
      />
    </Box>
  )
}
