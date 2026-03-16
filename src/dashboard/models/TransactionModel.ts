import { Model } from 'objection';

export type TransactionStatus =
  | 'received'
  | 'initiated'
  | 'pending'
  | 'processed'
  | 'failed';

export type PaymentStatus = 'pending' | 'success' | 'failed';

export type AggregatedPaymentStatus = Record<PaymentStatus, number> & { total: number };

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

  $parseDatabaseJson(json: Record<string, unknown>): Record<string, unknown> {
    const parsed = super.$parseDatabaseJson(json);

    if (parsed.feeAmount !== undefined && parsed.feeAmount !== null) {
      parsed.feeAmount = Number(parsed.feeAmount);
    }

    return parsed;
  }

  static async getByPaymentStatus(paymentStatus: PaymentStatus): Promise<TransactionModel[]> {
    return TransactionModel.query()
      .where('payment_status', paymentStatus)
      .orderBy('created_at', 'desc')
      .limit(100);
  }

  static async getAll(): Promise<TransactionModel[]> {
    return TransactionModel.query()
      .orderBy('created_at', 'desc')
      .limit(100);
  }

  static async getAggregatedPaymentStatus(): Promise<AggregatedPaymentStatus> {
    const rows = await TransactionModel.query()
      .select('payment_status')
      .count('* as count')
      .groupBy('payment_status');

    const totals: AggregatedPaymentStatus = {
      success: 0,
      failed: 0,
      pending: 0,
      total: 0,
    };

    rows.forEach((row) => {
      const paymentStatus = row.paymentStatus;

      if (paymentStatus === 'success' || paymentStatus === 'failed' || paymentStatus === 'pending') {
        const countValue = (row as unknown as { count: number | string }).count;
        totals[paymentStatus] = Number(countValue);
      }
    });

    totals.total = Math.min(totals.success + totals.failed + totals.pending, 100);

    return totals;
  }
}
