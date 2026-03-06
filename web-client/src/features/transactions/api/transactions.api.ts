import type { PaymentStatus, Transaction } from '../types'

type TransactionsResponse = {
  data: Transaction[]
  total: number
}

const dashboardApiBaseUrl = (import.meta.env.VITE_DASHBOARD_API_BASE_URL as string | undefined)
  ?.replace(/\/$/, '') ?? 'http://localhost:3001'

export async function fetchTransactionsByStatus(
  status: PaymentStatus,
  opts?: { signal?: AbortSignal }
): Promise<Transaction[]> {
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
  return payload.data
}
