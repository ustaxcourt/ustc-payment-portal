import type { Transaction, TransactionStatus, PaymentMethod } from './types'

const agencyIds = [
  '26PHF07R',
  '19KLM42A',
  '88QRS13Z',
  '07TUV56B',
  '51XYZ90C',
  '33ABC12D',
  '74LMN34E',
  '92OPQ78F',
]

const appClients = [
  'Admissions Portal',
  'Licensing Console',
  'Compliance Tracker',
  'Public Payments',
]

const feeCatalog = [
  { feeName: 'Non-attorney Admissions Exam Fee', feeId: 'FEE-NAE-001', feeAmount: 150 },
  { feeName: 'Attorney Registration Fee', feeId: 'FEE-ARF-010', feeAmount: 250 },
  { feeName: 'Reinstatement Fee', feeId: 'FEE-RST-021', feeAmount: 95 },
  { feeName: 'Certificate of Good Standing', feeId: 'FEE-CGS-005', feeAmount: 25 },
]

const accountHolders = [
  'Inez Thomson',
  'Rosario Gardner-Christensen',
  'Kirby Peters',
  'Herbert E. Goldstein',
  'Giovanni Cervantes',
  'Herman P. Nash',
  'Faulkner Tax Consulting, LLC',
  'Roy Rios',
]

const statusCycle: TransactionStatus[] = [
  'COMPLETED',
  'FAILED',
  'PENDING',
  'CANCELED',
  'REFUNDED',
  'UNKNOWN',
]

// Legacy to new method mapping (for reference)
// ['PayPal', 'Credit Card', 'ACHDebit', 'Venmo'] -> ['paypal','card','ach','venmo']
const paymentMethods: PaymentMethod[] = ['paypal', 'card', 'ach', 'venmo', 'apple_pay', 'google_pay', 'cash', 'other']

/**
 * Deterministic pseudo-random pick helper based on index.
 */
function pick<T>(arr: T[], index: number): T {
  return arr[index % arr.length]
}

/**
 * Creates a mostly-unique-ish token/id string.
 */
function mkId(prefix: string, i: number) {
  return `${prefix}-${(i + 1).toString().padStart(4, '0')}`
}

export const mockTransactions: Transaction[] = Array.from({ length: 100 }).map((_, i) => {
  const now = Date.now()
  // Keep the original “1 minute apart” pattern for createdAt
  const created = new Date(now - i * 60_000)

  // lastUpdatedAt is >= createdAt, up to +30 minutes after createdAt
  const lastUpdatedOffsetMin = (i * 7) % 31 // deterministic 0..30
  const lastUpdated = new Date(created.getTime() + lastUpdatedOffsetMin * 60_000)

  const fee = pick(feeCatalog, i)
  const appClientName = pick(appClients, i)
  const paymentMethod = pick(paymentMethods, i)
  const transactionStatus = pick(statusCycle, i)

  // Optional Pay.gov fields: only for some methods/status combinations
  const hasPaygov = ['card', 'ach', 'paypal', 'apple_pay', 'google_pay'].includes(paymentMethod)
  const paygovTrackingId = hasPaygov && i % 5 !== 0 ? mkId('PG', i) : null
  const paygovToken = hasPaygov && i % 7 === 0 ? `tok_${(i + 12345).toString(36)}` : null

  // Some light, realistic metadata
  const maybeMetadata =
    i % 6 === 0
      ? {
        accountHolder: pick(accountHolders, i),
        agencyId: pick(agencyIds, i),
        userAgent: ['Chrome', 'Safari', 'Firefox', 'Edge'][i % 4],
        // Useful for UI debugging: amounts and derived flags
        isHighValue: fee.feeAmount >= 200,
      }
      : null

  const tx: Transaction = {
    agencyTrackingId: mkId('AGY', i),              /** Agency Tracking ID */
    paygovTrackingId,                              /** Pay.gov Tracking ID (if one exists) */
    feeName: fee.feeName,                          /** Fee Name */
    feeId: fee.feeId,                              /** Fee Identifier */
    feeAmount: fee.feeAmount,                      /** Fee Amount */
    appClientName,                                 /** App/Client Name */
    transactionReferenceId: mkId('TXREF', i),      /** Transaction Reference ID */
    transactionStatus,                             /** Transaction Status */
    paygovToken,                                   /** Pay.gov token */
    paymentMethod,                                 /** Payment Method */
    lastUpdatedAt: lastUpdated.toISOString(),      /** Last Updated Timestamp (ISO 8601) */
    createdAt: created.toISOString(),              /** Created Timestamp (ISO 8601) */
    metadata: maybeMetadata,                       /** Metadata (free-form) */
  }

  return tx
})
