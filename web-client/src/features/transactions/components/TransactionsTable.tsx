import * as React from 'react'
import {
  DataGrid,
  type GridColDef,
  type GridKeyValue,
  type GridValueFormatter,
} from '@mui/x-data-grid'
import { Box, Alert } from '@mui/material'
import type { Transaction } from '../types'
import GridSortIconCircle from './GridSortIconCircle'

export interface TransactionsTableProps {
  rows: Transaction[]
  loading?: boolean
  status: string
  error: Error | null
}

/** Safely format an ISO date string as:
 *   YYYY-MM-DD
 *   HH:MM:SS
 * Returns '—' if invalid/missing.
 */
function formatIsoToTwoLines(value: unknown): string {
  if (typeof value !== 'string' || !value) return '—'
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) return '—'
  const iso = new Date(ms).toISOString()
  return `${iso.slice(0, 10)}\n${iso.slice(11, 19)}`
}

/** Sort comparator that works on ISO strings, nulls, or undefined. */
function compareIsoStrings(a?: string | null, b?: string | null): number {
  const ta = typeof a === 'string' ? Date.parse(a) : NaN
  const tb = typeof b === 'string' ? Date.parse(b) : NaN
  const aValid = Number.isFinite(ta)
  const bValid = Number.isFinite(tb)
  if (aValid && bValid) return ta - tb
  if (aValid && !bValid) return 1
  if (!aValid && bValid) return -1
  return 0
}

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

export default function TransactionsTable({ rows, loading, status, error }: TransactionsTableProps) {
  const columns = React.useMemo<GridColDef<Transaction>[]>(() => [
    {
      field: 'createdAt',
      headerName: 'Created At',
      flex: 1.2,
      minWidth: 180,
      renderCell: (params) => (
        <Box component="span" sx={{ whiteSpace: 'pre-line' }}>
          {formatIsoToTwoLines(params.row.createdAt)}
        </Box>
      ),
      sortComparator: (v1: GridKeyValue, v2: GridKeyValue) =>
        compareIsoStrings(v1 as string | null, v2 as string | null),
      sortable: true,
    },
    {
      field: 'lastUpdatedAt',
      headerName: 'Last Updated',
      flex: 1.2,
      minWidth: 180,
      renderCell: (params) => (
        <Box component="span" sx={{ whiteSpace: 'pre-line' }}>
          {formatIsoToTwoLines(params.row.lastUpdatedAt)}
        </Box>
      ),
      sortComparator: (v1: GridKeyValue, v2: GridKeyValue) =>
        compareIsoStrings(v1 as string | null, v2 as string | null),
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
  ], [])

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
