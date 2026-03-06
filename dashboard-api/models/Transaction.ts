import { Model } from 'objection';

export type TransactionStatus =
  | 'PENDING'
  | 'SUCCESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED'
  | 'REFUNDED'
  | 'UNKNOWN';

export type PaymentMethod =
  | 'card'
  | 'ach'
  | 'cash'
  | 'paypal'
  | 'apple_pay'
  | 'google_pay'
  | 'venmo'
  | 'other';

export default class Transaction extends Model {
  static tableName = 'transactions';

  id!: string;
  client_app!: string;
  external_reference_id!: string;
  fee_code!: string;
  amount_cents!: number;
  currency!: string;
  status!: string;
  created_at!: string;
  updated_at!: string;

  // Virtual property to convert to frontend format
  toFrontendFormat(): {
    agencyTrackingId: string;
    paygovTrackingId?: string | null;
    feeName: string;
    feeId: string;
    feeAmount: number;
    appClientName: string;
    transactionReferenceId: string;
    transactionStatus: TransactionStatus;
    paygovToken?: string | null;
    paymentMethod: PaymentMethod;
    lastUpdatedAt: string;
    createdAt: string;
    metadata?: Record<string, unknown> | null;
  } {
    // Map database status to frontend status
    const statusMap: Record<string, TransactionStatus> = {
      pending: 'PENDING',
      succeeded: 'SUCCESS',
      completed: 'COMPLETED',
      failed: 'FAILED',
      canceled: 'CANCELED',
      refunded: 'REFUNDED',
    };

    return {
      agencyTrackingId: this.id,
      paygovTrackingId: null,
      feeName: this.fee_code,
      feeId: this.fee_code,
      feeAmount: this.amount_cents / 100, // Convert cents to dollars
      appClientName: this.client_app,
      transactionReferenceId: this.external_reference_id,
      transactionStatus: statusMap[this.status] || 'UNKNOWN',
      paygovToken: null,
      paymentMethod: 'card', // Default to card, you can add this to DB later
      lastUpdatedAt: this.updated_at,
      createdAt: this.created_at,
      metadata: null,
    };
  }
}
