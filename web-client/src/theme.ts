import type { } from '@mui/x-data-grid/themeAugmentation' // For MuiDataGrid
import { createTheme } from '@mui/material/styles'

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
  interface Palette {
    completed: Palette['success'];
    failed: Palette['error'];
    pending: Palette['warning'];
  }
  interface PaletteOptions {
    completed?: PaletteOptions['success'];
    failed?: PaletteOptions['error'];
    pending?: PaletteOptions['warning'];
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
    completed: {
      light: '#c5ee93',
      main: '#2e7d32',
    },
    failed: {
      light: '#f7bbb0',
      main: '#c62828',
    },
    pending: {
      light: '#ffe396',
      main: '#f57c00',
    }
  },

  // Uses app module above
  app: {
    headerTone: {
      successBg: '#edf3ec', // use palette.success later if you like
      successBorder: '#2e7d32',
      failedBg: '#f8dfe2',
      failedBorder: '#c62828',
      pendingBg: '#faf3d1',
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
          fontWeight: 500,
          minHeight: 0,
          height: 36,
          borderRadius: 0,
          padding: theme.spacing(3),
          paddingInline: theme.spacing(1.25),
          marginRight: theme.spacing(1),
          backgroundColor: '#efefef',
          border: 0,
          fontSize: 20,
          color: '#000',

          // Keep chip square if present
          '& .MuiChip-root': { height: 22, borderRadius: 0 },
          '&.Mui-selected .MuiChip-root': { textDecoration: 'none !important' },

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
            border: `1px solid ${theme.palette.grey[700]}`,
            zIndex: 3,
            color: 'black',
            textDecoration: 'none',
            fontWeight: 700,
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
        disableColumnMenu: true,
        hideFooter: true,
        density: 'comfortable',
        showCellVerticalBorder: false,
        showColumnVerticalBorder: false,
      },
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 0,

          // Base gridlines (apply to all statuses)
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
            // Make header cells transparent so the container bg shows uniformly
            backgroundColor: 'transparent',
            '&:hover': { backgroundColor: 'transparent' },
            '&.MuiDataGrid-columnHeader--moving': { backgroundColor: 'transparent' },
            '&:focus, &:focus-within': { backgroundColor: 'transparent', outline: 'none' },
          },
          '& .MuiDataGrid-columnHeaderTitleContainer, & .MuiDataGrid-iconButtonContainer': {
            opacity: 1,
          },
          '& .MuiDataGrid-row': {
            borderBottom: `1px solid ${theme.palette.grey[400]}`,
          },
          '& .MuiDataGrid-columnSeparator': {
            visibility: 'visible',
            '& svg': { color: theme.palette.grey[400] },
          },

          // ---- Status-scoped rules (root has data-status) ----
          '&[data-status="COMPLETED"] .MuiDataGrid-columnHeaders': {
            backgroundColor: theme.app.headerTone.successBg,
          },
          '&[data-status="FAILED"] .MuiDataGrid-columnHeaders': {
            backgroundColor: theme.app.headerTone.failedBg,
          },
          '&[data-status="PENDING"] .MuiDataGrid-columnHeaders': {
            backgroundColor: theme.app.headerTone.pendingBg,
          },
        }),
      },
    },
  },
})

export default theme
