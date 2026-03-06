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

// Converts string → Date for MUI 'dateTime' columns
const toDateOrNull = (v: unknown): Date | null => {
  if (typeof v !== 'string' || !v) return null;
  const d = dayjs(v);
  return d.isValid() ? d.toDate() : null;
};

// Day/time formatting in ONE LINE (cleaner for DataGrid)
export const fmtDateTime = (v: unknown): string => {
  if (!(v instanceof Date)) return '—';
  return dayjs(v).format('YYYY-MM-DD HH:mm:ss');
};

// Metadata bullet formatting
export const fmtMetadata = (metadata: Record<string, string> | null | undefined): string => {
  if (!metadata) return '—';
  return Object.entries(metadata)
    .map(([k, v]) => `• ${k}: ${v}`)
    .join('\n');
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
      valueGetter: (_value, row) => toDateOrNull(row.createdAt),
      renderCell: (params) => (
        <Box component="span" sx={{ whiteSpace: 'pre-line', fontVariantNumeric: 'tabular-nums' }}>
          {fmtDateTime(params.value)}
        </Box>
      ),
      sortable: true,
    },
    {
      field: 'lastUpdatedAt',
      headerName: 'Last Updated',
      type: 'dateTime',
      flex: 1.2,
      minWidth: 180,
      valueGetter: (_value, row) => toDateOrNull(row.lastUpdatedAt),
      renderCell: (params) => (
        <Box component="span" sx={{ whiteSpace: 'pre-line', fontVariantNumeric: 'tabular-nums' }}>
          {fmtDateTime(params.value)}
        </Box>
      ),
      sortable: true,
    },

    { field: 'feeName', headerName: 'Fee Name', flex: 1.4, minWidth: 230 },
    { field: 'feeId', headerName: 'Fee Identifier', flex: 1, minWidth: 150 },

    {
      field: 'feeAmount',
      headerName: 'Amount',
      flex: 0.6,
      minWidth: 110,
      type: 'number',
      valueFormatter: moneyFormatter,
      sortable: true,
    },

    { field: 'clientName', headerName: 'Client Name', flex: 1.2, minWidth: 180 },

    {
      field: 'paymentMethod',
      headerName: 'Payment Method',
      flex: 1,
      minWidth: 140,
    },
    {
      field: 'paymentStatus',
      headerName: 'Payment Status',
      flex: 1,
      minWidth: 130,
      sortable: true,
    },
    {
      field: 'transactionStatus',
      headerName: 'Transaction Status',
      flex: 1,
      minWidth: 160,
      valueFormatter: nullableTextFormatter,
    },

    { field: 'agencyTrackingId', headerName: 'Agency Tracking ID', flex: 1.2, minWidth: 180 },

    {
      field: 'paygovTrackingId',
      headerName: 'Pay.gov Tracking ID',
      flex: 1.2,
      minWidth: 180,
      valueFormatter: nullableTextFormatter,
    },

    {
      field: 'paygovToken',
      headerName: 'Pay.gov Token',
      flex: 1,
      minWidth: 160,
      valueFormatter: nullableTextFormatter,
    },

    {
      field: 'transactionReferenceId',
      headerName: 'Reference ID',
      flex: 1.2,
      minWidth: 170,
    },

    {
      field: 'metadata',
      headerName: 'Metadata',
      flex: 2,
      minWidth: 260,
      renderCell: (params) => (
        <Box
          component="span"
          sx={{ whiteSpace: 'pre-line', fontSize: '0.85rem', lineHeight: 1.3 }}
        >
          {fmtMetadata(params.row.metadata)}
        </Box>
      ),
    },
  ];

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
