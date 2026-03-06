import { Model } from 'objection';

export type TransactionStatus =
  | 'PENDING'
  | 'SUCCESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED'
  | 'REFUNDED'
  | 'UNKNOWN';

export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

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

  agency_tracking_id!: string;
  paygov_tracking_id?: string | null;
  fee_name!: string;
  fee_id!: string;
  fee_amount!: number;
  client_name!: string;
  transaction_reference_id!: string;
  payment_status!: PaymentStatus;
  transaction_status?: TransactionStatus | null;
  paygov_token?: string | null;
  payment_method!: PaymentMethod;
  created_at!: string;
  last_updated_at!: string;
  metadata?: Record<string, string> | null;

  // Virtual property to convert to frontend format
  toFrontendFormat(): {
    agencyTrackingId: string;
    paygovTrackingId?: string | null;
    feeName: string;
    feeId: string;
    feeAmount: number;
    clientName: string;
    transactionReferenceId: string;
    paymentStatus: PaymentStatus;
    transactionStatus?: TransactionStatus;
    paygovToken?: string | null;
    paymentMethod: PaymentMethod;
    lastUpdatedAt: string;
    createdAt: string;
    metadata?: Record<string, string> | null;
  } {
    return {
      agencyTrackingId: this.agency_tracking_id,
      paygovTrackingId: this.paygov_tracking_id ?? null,
      feeName: this.fee_name,
      feeId: this.fee_id,
      feeAmount: Number(this.fee_amount),
      clientName: this.client_name,
      transactionReferenceId: this.transaction_reference_id,
      paymentStatus: this.payment_status,
      transactionStatus: this.transaction_status ?? undefined,
      paygovToken: this.paygov_token ?? null,
      paymentMethod: this.payment_method,
      lastUpdatedAt: this.last_updated_at,
      createdAt: this.created_at,
      metadata: this.metadata ?? null,
    };
  }
}
