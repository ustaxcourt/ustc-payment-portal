/**
 * Domain status for a transaction record.
 * Keep this aligned with what your API actually returns.
 */
export type TransactionStatus =
  | 'received'
  | 'initiated'
  | 'pending'
  | 'processed'
  | 'failed'

export type PaymentStatus = 'pending' | 'success' | 'failed'

/** UI-level tab identifier — extends PaymentStatus with the 'all' aggregate tab. */
export type TabStatus = PaymentStatus | 'all'

/**
 * Supported payment instruments in dev.
 * Add/remove as your Payment Portal grows.
 */
export type PaymentMethod =
  | 'card'
  | 'ach'
  | 'cash'
  | 'paypal'
  | 'apple_pay'
  | 'google_pay'
  | 'venmo'
  | 'other'

/**
 * A single transaction row as displayed in the dashboard.
 * Field names are camelCase to match common JSON/TS conventions.
 * Comments show the label you specified in the Acceptance Criteria.
 */
export type Transaction = {
  agencyTrackingId: string /** Agency Tracking ID */
  paygovTrackingId?: string | null /** Pay.gov Tracking ID (if one exists) */
  feeName: string /** Fee Name */
  feeId: string /** Fee Identifier */
  feeAmount: number /** Fee Amount */
  clientName: string /** App/Client Name */
  transactionReferenceId: string /** Transaction Reference ID */
  paymentStatus: PaymentStatus /** Payment Status */
  transactionStatus?: TransactionStatus /** Transaction Status */
  paygovToken?: string | null /** Pay.gov token */
  paymentMethod: PaymentMethod /** Payment Method */
  lastUpdatedAt: string /** Last Updated Timestamp (ISO 8601) */
  createdAt: string /** Created Timestamp (ISO 8601) */
  metadata?: Record<string, string> | null /** Metadata supplied(free - form key / value bag) */
}
