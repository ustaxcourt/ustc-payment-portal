import type { Transaction, TransactionStatus } from '../types'
import { mockTransactions } from '../mock'

/**
 * Simulate a network fetch with optional latency and status filtering.
 * Replace implementation with real fetch when API is ready.
 */
export async function fetchTransactionsByStatus(
  status: TransactionStatus,
  opts?: { signal?: AbortSignal; latencyMs?: number }
): Promise<Transaction[]> {
  const { signal, latencyMs = 250 } = opts ?? {}

  // Simulate latency & support cancellation
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, latencyMs)
    if (signal) {
      const onAbort = () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      }
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })

  // Filter locally using the mock
  return mockTransactions.filter((t) => t.transactionStatus === status)
}

/**
 * Example: fetch all (still backed by mock).
 * Useful if a parent wants to aggregate totals, etc.
 */
export async function fetchAllTransactions(
  opts?: { signal?: AbortSignal; latencyMs?: number }
): Promise<Transaction[]> {
  const { signal, latencyMs = 250 } = opts ?? {}
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, latencyMs)
    if (signal) {
      const onAbort = () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      }
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
  return mockTransactions
}
