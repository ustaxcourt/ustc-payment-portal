import { Model } from 'objection';

export type TransactionStatus =
  | 'received'
  | 'initiated'
  | 'pending'
  | 'processed'
  | 'failed';

export type PaymentStatus = 'pending' | 'success' | 'failed';

export type PaymentMethod =
  | 'card'
  | 'ach'
  | 'cash'
  | 'paypal'
  | 'apple_pay'
  | 'google_pay'
  | 'venmo'
  | 'other';

export default class TransactionModel extends Model {
  agencyTrackingId!: string;
  paygovTrackingId?: string | null;
  feeName!: string;
  feeId!: string;
  feeAmount!: number;
  clientName!: string;
  transactionReferenceId!: string;
  paymentStatus!: PaymentStatus;
  transactionStatus?: TransactionStatus | null;
  paygovToken?: string | null;
  paymentMethod!: PaymentMethod;
  createdAt!: string;
  lastUpdatedAt!: string;
  metadata?: Record<string, string> | null;

  static get tableName() {
    return 'transactions';
  }

  static async getByPaymentStatus(paymentStatus: PaymentStatus): Promise<TransactionModel[]> {
    return TransactionModel.query()
      .where('payment_status', paymentStatus)
      .orderBy('created_at', 'desc')
      .limit(100);
  }
}
