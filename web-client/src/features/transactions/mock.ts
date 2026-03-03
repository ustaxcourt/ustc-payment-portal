// mock.ts
import type { Transaction } from './types'

export const mockTransactions: Transaction[] = Array.from({ length: 100 }).map((_, i) => ({
  id: `tx-${i + 1}`,
  timestamp: new Date(Date.now() - i * 60000).toISOString(), // 1 min apart
  feeType: 'Non-attorney Admissions Exam Fee',
  amount: 150,
  payType: ['PayPal', 'Credit Card', 'ACHDebit', 'Venmo'][i % 4],
  accountHolder: [
    'Inez Thomson',
    'Rosario Gardner-Christensen',
    'Kirby Peters',
    'Herbert E. Goldstein',
    'Giovanni Cervantes',
    'Herman P. Nash',
    'Faulkner Tax Consulting, LLC',
    'Roy Rios'
  ][i % 8],
  agencyId: '26PHF07R',
  status: (['SUCCESS', 'FAILED', 'PENDING'] as const)[i % 3]
}))
