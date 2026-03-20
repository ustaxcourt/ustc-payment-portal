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
  | 'plastic_card'
  | 'ach'
  | 'paypal';


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

  static get idColumn() {
    return 'agencyTrackingId';
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
      .where('paymentStatus', paymentStatus)
      .orderBy('createdAt', 'desc')
      .limit(100);
  }

  static async getAll(): Promise<TransactionModel[]> {
    return TransactionModel.query()
      .orderBy('createdAt', 'desc')
      .limit(100);
  }

  static async getAggregatedPaymentStatus(): Promise<AggregatedPaymentStatus> {
    const rows = await TransactionModel.query()
      .select('paymentStatus')
      .count('* as count')
      .groupBy('paymentStatus')

    // TODO: Update aggregation for success, failed, and pending in PAY-053
    const data = await TransactionModel.query()
      .orderBy('createdAt', 'desc')
      .page(0, 100);

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

    // Use the total count from the paginated query
    totals.total = data.results.length;
    return totals;
  }
}
