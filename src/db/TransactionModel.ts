import { Model } from 'objection';
import type { DashboardTransactionStatus } from '../schemas/TransactionDashboard.schema';
import type { PaymentStatus } from '../schemas/PaymentStatus.schema';

export type TransactionStatus = DashboardTransactionStatus;
export type { PaymentStatus };

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
  paymentMethod?: PaymentMethod | null;
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
      .select('paymentStatus')
      .count('* as count')
      .groupBy('paymentStatus');

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

    totals.total = totals.success + totals.failed + totals.pending;
    return totals;
  }

  static async createReceived(data: Omit<Partial<TransactionModel>, 'paymentStatus' | 'transactionStatus'>): Promise<TransactionModel> {
    return this.query().insertAndFetch({
      ...data,
      paymentStatus: 'pending',
      transactionStatus: 'received',
    });
  }

  static async updateToInitiated(agencyTrackingId: string, paygovToken: string): Promise<void> {
    await this.query()
      .patch({ transactionStatus: 'initiated', paygovToken })
      .where('agencyTrackingId', agencyTrackingId);
  }

  static async updateToFailed(agencyTrackingId: string): Promise<void> {
    await this.query()
      .patch({ transactionStatus: 'failed', paymentStatus: 'failed' })
      .where('agencyTrackingId', agencyTrackingId);
  }
}
