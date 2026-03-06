import * as React from 'react'
import {
  DataGrid,
  type GridColDef,
  type GridValueFormatter,
} from '@mui/x-data-grid'
import { Box, Alert } from '@mui/material'
import type { Transaction } from '../types'
import GridSortIconCircle from './GridSortIconCircle'
import dayjs from 'dayjs'

export interface TransactionsTableProps {
  rows: Transaction[]
  loading?: boolean
  status: string
  error: Error | null
}

// ISO string -> Date | null (safe)
const toDateOrNull = (v: unknown): Date | null => {
  if (typeof v !== 'string' || !v) return null;
  const d = dayjs(v);
  return d.isValid() ? d.toDate() : null;
};

// Display as "YYYY-MM-DD HH:mm:ss" using dayjs
const fmtOneLine = (d: unknown): string => {
  if (!(d instanceof Date)) return '—';
  const m = dayjs(d);
  return m.isValid() ? m.format('YYYY-MM-DD HH:mm:ss') : '—';
};

/** v8-compatible money formatter — note the generic <Transaction> */
const moneyFormatter: GridValueFormatter<Transaction> = (value) => {
  if (value == null) return '—'
  const n = Number(value)
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : '—'
}

/** v8-compatible nullable text formatter — note the generic <Transaction> */
const nullableTextFormatter: GridValueFormatter<Transaction> = (value) => {
  return value ? String(value) : '—'
}

export default function TransactionsTable({ rows, loading, status, error }: TransactionsTableProps): React.ReactElement {
  const columns: GridColDef<Transaction>[] = [
    {
      field: 'createdAt',
      headerName: 'Created At',
      type: 'dateTime',
      flex: 1.2,
      minWidth: 180,
      // IMPORTANT: MUI wants a Date for 'dateTime' columns
      valueGetter: (_value: unknown, row: Transaction): Date | null =>
        toDateOrNull(row.createdAt),
      // Optional custom render with dayjs
      renderCell: (params) => fmtOneLine(params.value),
      // Built-in dateTime sorting works when the value is a Date, so no custom comparator needed
      sortable: true,
    },
    {
      field: 'lastUpdatedAt',
      headerName: 'Last Updated',
      type: 'dateTime',
      flex: 1.2,
      minWidth: 180,
      valueGetter: (_value: unknown, row: Transaction): Date | null =>
        toDateOrNull(row.lastUpdatedAt),
      renderCell: (params) => fmtOneLine(params.value),
      sortable: true,
    },
    { field: 'feeName', headerName: 'Fee Name', flex: 1.5, minWidth: 240, sortable: false },
    { field: 'feeIdentifier', headerName: 'Fee Identifier', flex: 1, minWidth: 160, sortable: false },
    {
      field: 'feeAmount',
      headerName: 'Amount',
      flex: 0.6,
      minWidth: 110,
      type: 'number',
      valueFormatter: moneyFormatter,
      sortable: true,
    },
    { field: 'paymentMethod', headerName: 'Payment Method', flex: 1, minWidth: 140, sortable: false },
    { field: 'transactionStatus', headerName: 'Status', flex: 1, minWidth: 130, sortable: true },
    { field: 'agencyTrackingId', headerName: 'Agency Tracking ID', flex: 1.2, minWidth: 180, sortable: false },
    {
      field: 'paygovTrackingId',
      headerName: 'Pay.gov Tracking ID',
      flex: 1.2,
      minWidth: 180,
      valueFormatter: nullableTextFormatter,
      sortable: false,
    },
    { field: 'transactionReferenceId', headerName: 'Reference ID', flex: 1.2, minWidth: 180, sortable: false },
  ]

  return (
    <Box
      sx={(theme) => ({
        height: 'calc(100vh - 230px)',
        width: '100%',
        border: `1px solid ${theme.palette.grey[700]}`,
        borderColor: '#000',
        borderRadius: 0,
        paddingTop: 3,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
      })}
    >
      {error && (
        <Alert
          severity="error"
          variant="outlined"
          sx={{ mx: 1.5 }}
          role="alert"
          aria-live="assertive"
        >
          {error.message || 'Something went wrong while loading transactions.'}
        </Alert>
      )}

      <DataGrid<Transaction>
        rows={rows}
        columns={columns}
        getRowId={(r) => r.agencyTrackingId}
        disableColumnMenu
        hideFooter
        loading={loading}
        density="comfortable"
        initialState={{
          sorting: { sortModel: [{ field: 'createdAt', sort: 'desc' }] },
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
          '& .MuiDataGrid-columnHeaderTitleContainer': {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            gap: theme.spacing(1),
          },
          '& .MuiDataGrid-sortIcon': {
            order: 2,
            marginLeft: 'auto',
            color: '#111',
            opacity: 1,
          },
          '& .MuiDataGrid-sortIconButton': {
            order: 2,
            marginLeft: 'auto',
            color: '#111',
            padding: 0,
            background: 'transparent',
            '&:hover': { background: 'transparent' },
          },
          '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 700 },
          '& .MuiDataGrid-columnHeader': {
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
