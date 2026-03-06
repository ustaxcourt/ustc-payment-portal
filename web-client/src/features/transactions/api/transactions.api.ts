import type { PaymentStatus, Transaction } from '../types'
import { mockTransactions } from '../mock'

export async function fetchTransactionsByStatus(
  status: PaymentStatus,
  opts?: { signal?: AbortSignal; latencyMs?: number }
): Promise<Transaction[]> {
  const { signal, latencyMs = 250 } = opts ?? {}

  // return fetch(`/transactions?status=${status}`, { signal })
  // .then((res) => res.json())

  // TODO: Replace this fetch script with above once path is available
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

  return mockTransactions.filter((t) => t.paymentStatus === status)
}
