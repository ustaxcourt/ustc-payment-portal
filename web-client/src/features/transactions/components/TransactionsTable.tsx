import * as React from 'react'
import { DataGrid } from '@mui/x-data-grid'
import type { GridColDef } from '@mui/x-data-grid'
import { Box } from '@mui/material'
import type { Transaction } from '../types'

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
      { field: 'feeType', headerName: 'Fee Type', flex: 1.5, minWidth: 220 },
      {
        field: 'amount',
        headerName: 'Amount',
        flex: 0.8,
        minWidth: 110,
        type: 'number',
        valueFormatter: ({ value }) => `$${Number(value).toFixed(2)}`,
        sortable: true
      },
      { field: 'payType', headerName: 'Pay Type', flex: 1, minWidth: 120 },
      { field: 'accountHolder', headerName: 'Account Holder', flex: 1.2, minWidth: 180 },
      { field: 'agencyId', headerName: 'Agency ID', flex: 0.8, minWidth: 120 }
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
        '& .MuiDataGrid-columnHeaders': { bgcolor: 'grey.100', fontWeight: 700 },
        '& .MuiDataGrid-cell': { alignItems: 'flex-start' },
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

        sx={(theme) => {
          const tones = theme.app.headerTone
          const tone =
            status === 'SUCCESS'
              ? { bg: tones.successBg, border: tones.successBorder }
              : status === 'FAILED'
                ? { bg: tones.failedBg, border: tones.failedBorder }
                : { bg: tones.pendingBg, border: tones.pendingBorder }

          return {
            '& .MuiDataGrid-columnHeader': {
              backgroundColor: tone.bg,
              '&:hover': { backgroundColor: tone.bg },
            },
          }
        }}
        showCellVerticalBorder
        showColumnVerticalBorder
      />
    </Box>
  )
}
