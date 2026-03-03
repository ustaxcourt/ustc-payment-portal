import * as React from 'react'
import { DataGrid } from '@mui/x-data-grid'
import type { GridColDef } from '@mui/x-data-grid'
import { Box } from '@mui/material'
import type { Transaction } from '../types'
import GridSortIconCircle from './GridSortIconCircle'

export interface TransactionsTableProps {
  rows: Transaction[]
  loading?: boolean
  status: string
}

export default function TransactionsTable({ rows, loading, status }: TransactionsTableProps) {
  const columns = React.useMemo<GridColDef<Transaction>[]>(
    () => [
      {
        field: 'timestamp',
        headerName: 'Timestamp',
        flex: 1.2,
        minWidth: 180,
        valueGetter: (value) => {
          // value is ISO string
          const d = new Date(value as string)
          // Match the screenshot style (date + time on new line)
          return `${d.toISOString().slice(0, 10)}\n${d.toISOString().slice(11, 19)}`
        },
        renderCell: (params) => (
          <Box component="span" sx={{ whiteSpace: 'pre-line' }}>
            {params.value as string}
          </Box>
        ),
        sortComparator: (v1, v2) => v1.localeCompare(v2),
        sortable: true
      },
      { field: 'feeType', headerName: 'Fee Type', flex: 1.5, minWidth: 220, sortable: false },
      {
        field: 'amount',
        headerName: 'Amount',
        flex: 0.8,
        minWidth: 110,
        type: 'number',
        valueFormatter: ({ value }) => `$${Number(value).toFixed(2)}`,
        sortable: true
      },
      { field: 'payType', headerName: 'Pay Type', flex: 1, minWidth: 120, sortable: false },
      { field: 'accountHolder', headerName: 'Account Holder', flex: 1.2, minWidth: 180, sortable: false },
      { field: 'agencyId', headerName: 'Agency ID', flex: 0.8, minWidth: 120, sortable: false }
    ],
    []
  )

  return (
    <Box
      sx={(theme) => ({
        height: 'calc(100vh - 230px)',
        width: '100%',
        border: `1px solid ${theme.palette.grey[700]}`,
        borderColor: '#000',
        borderRadius: 0,
        paddingTop: 3,
      })}
    >
      <DataGrid
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        disableColumnMenu
        hideFooter
        loading={loading}
        density="comfortable"
        initialState={{
          sorting: { sortModel: [{ field: 'timestamp', sort: 'desc' }] },
        }}
        slotProps={{
          root: { 'data-status': status },
        }}
        slots={{
          columnSortedAscendingIcon: () => <GridSortIconCircle dir="asc" />,
          columnSortedDescendingIcon: () => <GridSortIconCircle dir="desc" />,
          columnUnsortedIcon: () => <GridSortIconCircle dir="none" />,
        }}
        sx={(theme) => ({
          // 1) Make header content stretch and push the icon to the far right
          '& .MuiDataGrid-columnHeaderTitleContainer': {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',   // text left, icon right
            width: '100%',
            gap: theme.spacing(1),
          },

          // 2) Ensure the icon container is on the right and not dimmed by defaults
          '& .MuiDataGrid-sortIcon': {
            order: 2,
            marginLeft: 'auto',
            color: '#111',        // black arrows to match your spec/screenshot
            opacity: 1,
          },

          // Some versions wrap the icon in a button container; push that as well
          '& .MuiDataGrid-sortIconButton': {
            order: 2,
            marginLeft: 'auto',
            color: '#111',
            padding: 0,           // tidy spacing
            background: 'transparent',
            '&:hover': { background: 'transparent' },
          },

          // Tidy the title side (left part)
          '& .MuiDataGrid-columnHeaderTitle': {
            fontWeight: 700,
          },


          '& .MuiDataGrid-columnHeader': {
            // hide sort affordance on non-sortable columns
            '&.MuiDataGrid-columnHeader--sortable': { cursor: 'pointer' },
            '&:not(.MuiDataGrid-columnHeader--sortable) .MuiDataGrid-sortIcon, & :not(.MuiDataGrid-columnHeader--sortable) .MuiDataGrid-sortIconButton':
              { display: 'none' },
          },

        })}
        showCellVerticalBorder
        showColumnVerticalBorder
      />
    </Box>
  )
}
