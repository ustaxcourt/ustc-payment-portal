// src/components/GridSortIconCircle.tsx
import * as React from 'react';
import { Box } from '@mui/material';

type Dir = 'asc' | 'desc' | 'none';

export default function GridSortIconCircle({ dir = 'none' as Dir }): React.ReactElement {
  // Simple 16x16 white arrow inside a 24x24 black circle
  return (
    <Box
      aria-hidden
      sx={{
        width: 24,
        height: 24,
        borderRadius: '50%',
        bgcolor: '#000',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      {dir === 'asc' && (
        <svg width="16" height="16" viewBox="0 0 24 24">
          <path
            d="M7 14l5-5 5 5"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {dir === 'desc' && (
        <svg width="16" height="16" viewBox="0 0 24 24">
          <path
            d="M7 10l5 5 5-5"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {dir === 'none' && (
        // Unsorted: you can show a neutral double-arrow or a single faint arrow.
        // Here we show a small chevron (down) at lower opacity.
        <svg width="16" height="16" viewBox="0 0 24 24" style={{ opacity: 0.6 }}>
          <path
            d="M7 10l5 5 5-5"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </Box>
  );
}
