import type { } from '@mui/x-data-grid/themeAugmentation' // For MuiDataGrid
import { alpha, createTheme } from '@mui/material/styles'

declare module '@mui/material/styles' {
  interface Theme {
    app: {
      headerTone: {
        successBg: string
        successBorder: string
        failedBg: string
        failedBorder: string
        pendingBg: string
        pendingBorder: string
      }
    }
  }
  interface ThemeOptions {
    app?: Partial<Theme['app']>
  }
}

const theme = createTheme({
  palette: {
    // Set your brand blue once, reuse everywhere
    primary: {
      main: '#1a4480',    // <- the blue you used on the divider/subtitle
    },
    // Optional: adjust greys/backgrounds to match your mock
    background: {
      default: '#fff',
      paper: '#fff',
    },
  },

  // Uses app module above
  app: {
    headerTone: {
      successBg: '#ebf5eb', // use palette.success later if you like
      successBorder: '#2e7d32',
      failedBg: '#ffe6e6',
      failedBorder: '#c62828',
      pendingBg: '#fff5da',
      pendingBorder: '#f57c00',
    },
  },

  typography: {
    // Make h4/h5 bolder globally so header picks it up
    h4: { fontWeight: 800, lineHeight: 1.1 },
    h5: { fontWeight: 800, lineHeight: 1.1 },
  },

  components: {
    // Global Divider styles: a “blue bottom border” look
    MuiDivider: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderColor: theme.palette.primary.main, // use theme primary
          borderTop: 'none',
        }),
      },
      // Optional variants so you can pick thickness via `variant="thick"`
      variants: [
        {
          props: { variant: 'fullWidth' },
          style: ({ theme: _theme }) => ({
            borderBottomWidth: 4, // nicer default for full-width dividers
          }),
        },
        {
          // Custom “thick” variant you can opt into
          props: { variant: 'middle' }, // or define your own prop using sx when used
          style: { borderBottomWidth: 6 },
        },
      ],
    },

    // If you want the subtitle (h5) to be blue globally:
    MuiTypography: {
      styleOverrides: {
        h5: ({ theme }) => ({
          color: theme.palette.primary.main,
        }),
      },
    },

    // Tabs row
    MuiTabs: {
      styleOverrides: {
        root: ({ theme: _theme }) => ({
          width: '100%',
          minHeight: 0,
          borderBottom: 'none',
          position: 'relative',
          zIndex: 2,
          top: 1,
        }),
        // We won't use the indicator for this pattern
        indicator: { display: 'none' },
      },
    },

    // Individual Tab
    MuiTab: {
      defaultProps: {
        disableRipple: true,
      },
      styleOverrides: {
        root: ({ theme }) => ({
          textTransform: 'none',
          fontWeight: 700,
          minHeight: 0,
          height: 36,
          borderRadius: 0,
          paddingInline: theme.spacing(1.25),
          marginRight: theme.spacing(1),
          backgroundColor: '#efefef',
          border: `1px solid ${theme.palette.grey[700]}`,

          // Keep chip square if present
          '& .MuiChip-root': { height: 22, fontWeight: 700, borderRadius: 0 },

          // Keep square in all states
          '&:hover': { borderRadius: 0 },
          '&.Mui-focusVisible': { borderRadius: 0, outline: 'none', boxShadow: 'none' },

          // Selected tab: remove bottom border and overlap by 1px to "erase" the row line
          '&.Mui-selected': {
            borderRadius: 0,
            backgroundColor: '#fff',
            borderBottomColor: 'transparent', // hide the tab's bottom border
            marginBottom: -1,                  // overlap the Tabs root border-bottom by 1px
            position: 'relative',
            zIndex: 3,
          },
          '&.Mui-selected.Mui-focusVisible': {
            borderRadius: 0,
            outline: 'none',
            boxShadow: 'none',
            borderBottomColor: 'transparent',
            marginBottom: -1,
          },

          '::before, ::after': { borderRadius: 0 },
        }),
      },
    },

    // Optional: normalize ButtonBase focus so it doesn't add a highlight
    MuiButtonBase: {
      defaultProps: { disableRipple: true },
      styleOverrides: {
        root: {
          outline: 'none',
          '&:focus, &:focus-visible': { outline: 'none', boxShadow: 'none' },
          WebkitTapHighlightColor: 'transparent',
        },
      },
    },


    // MuiDataGrid styles
    MuiDataGrid: {
      defaultProps: {
        // your desired defaults
        disableColumnMenu: true,
        hideFooter: true,
        density: 'comfortable',
        showCellVerticalBorder: false,
        showColumnVerticalBorder: false,
      },
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 0,
          // Header styles (background + bottom rule)
          '& .MuiDataGrid-columnHeaders': {
            backgroundColor: theme.palette.grey[100],
            fontWeight: 700,
            borderTop: 0,
            borderLeft: `1px solid ${theme.palette.grey[700]}`,
            borderBottom: `1px solid ${theme.palette.grey[700]}`,
          },
          '& .MuiDataGrid-columnHeader': {
            borderRight: `1px solid ${theme.palette.grey[700]}`,
            fontWeight: 700,
            borderTop: 0,
            borderBottom: `1px solid ${theme.palette.grey[700]}`,
          },

          // Horizontal row separators
          '& .MuiDataGrid-row': {
            borderBottom: `1px solid ${theme.palette.grey[400]}`,
          },

          // Ensure vertical separators are visible (older versions hide them)
          '& .MuiDataGrid-columnSeparator': {
            visibility: 'visible',
            '& svg': {
              color: theme.palette.grey[400],
            },
          },
        }),
      },
    },
  },
})

export default theme
