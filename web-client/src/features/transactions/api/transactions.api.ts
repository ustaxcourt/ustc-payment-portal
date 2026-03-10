import type { PaymentStatus, Transaction } from '../types'

export type PaymentStatusCounts = Record<PaymentStatus, number>

export type TransactionsResponse = {
  data: Transaction[]
  total: number
}

const dashboardApiBaseUrl = (import.meta.env.VITE_DASHBOARD_API_BASE_URL as string | undefined)
  ?.replace(/\/$/, '') ?? 'http://localhost:3001'

export async function fetchTransactionsByStatus(
  status: PaymentStatus,
  opts?: { signal?: AbortSignal }
): Promise<TransactionsResponse> {
  const { signal } = opts ?? {}

  const url = `${dashboardApiBaseUrl}/api/transactions/${status}`
  const response = await fetch(url, {
    method: 'GET',
    signal,
  })

  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status}`)
  }

  const payload = (await response.json()) as TransactionsResponse
  return payload
}

export async function fetchAllTransactions(
  opts?: { signal?: AbortSignal }
): Promise<TransactionsResponse> {
  const { signal } = opts ?? {}

  const url = `${dashboardApiBaseUrl}/api/transactions`
  const response = await fetch(url, {
    method: 'GET',
    signal,
  })

  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status}`)
  }

  return (await response.json()) as TransactionsResponse
}

export async function fetchTransactionPaymentStatus(
  opts?: { signal?: AbortSignal }
): Promise<PaymentStatusCounts> {
  const { signal } = opts ?? {}

  const url = `${dashboardApiBaseUrl}/api/transaction-payment-status`
  const response = await fetch(url, {
    method: 'GET',
    signal,
  })

  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status}`)
  }

  const payload = (await response.json()) as Partial<PaymentStatusCounts>
  return {
    success: payload.success ?? 0,
    failed: payload.failed ?? 0,
    pending: payload.pending ?? 0,
  }
}
