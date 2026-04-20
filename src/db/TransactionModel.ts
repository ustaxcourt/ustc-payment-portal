import { Model } from 'objection';
import FeesModel from './FeesModel';
import type { PaymentStatus } from '../schemas/PaymentStatus.schema';
import type { TransactionStatus as SchemaTransactionStatus } from '../schemas/TransactionStatus.schema';
import { getKnex } from './knex';

export type TransactionStatus = SchemaTransactionStatus;
export type { PaymentStatus };

export type AggregatedPaymentStatus = Record<PaymentStatus, number> & { total: number };

export type PaymentMethod =
  | 'plastic_card'
  | 'ach'
  | 'paypal';


export default class TransactionModel extends Model {
  agencyTrackingId!: string;
  paygovTrackingId?: string | null;
  feeId!: string;
  transactionAmount!: number;
  feeName?: string;
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

  static get relationMappings() {
    return {
      fee: {
        relation: Model.BelongsToOneRelation,
        modelClass: FeesModel,
        join: {
          from: 'transactions.feeId',
          to: 'fees.feeId',
        },
      },
    };
  }

  $parseDatabaseJson(json: Record<string, unknown>): Record<string, unknown> {
    const parsed = super.$parseDatabaseJson(json);

    if (parsed.transactionAmount !== undefined && parsed.transactionAmount !== null) {
      parsed.transactionAmount = Number(parsed.transactionAmount);
    }

    return parsed;
  }

  static async getByPaymentStatus(paymentStatus: PaymentStatus): Promise<TransactionModel[]> {
    await getKnex();
    return TransactionModel.query()
      .alias('t')
      .join('fees as f', 't.feeId', 'f.feeId')
      .select('t.*', 'f.name as feeName')
      .where('t.paymentStatus', paymentStatus)
      .orderBy('t.createdAt', 'desc')
      .limit(100);
  }

  static async getAll(): Promise<TransactionModel[]> {
    await getKnex();
    return TransactionModel.query()
      .alias('t')
      .join('fees as f', 't.feeId', 'f.feeId')
      .select('t.*', 'f.name as feeName')
      .orderBy('t.createdAt', 'desc')
      .limit(100);
  }

  static async getAggregatedPaymentStatus(): Promise<AggregatedPaymentStatus> {
    await getKnex();
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

    totals.total = rows.reduce((sum, row) => {
      const countValue = (row as unknown as { count: number | string }).count;
      return sum + Number(countValue);
    }, 0);
    return totals;
  }

  static async createReceived(data: Partial<TransactionModel>): Promise<TransactionModel> {
    await getKnex();
    const newTransaction = await this.query().insertAndFetch({
      ...data,
      paymentStatus: 'pending',
      transactionStatus: 'received',
    });

    return newTransaction;
  }

  static async updateToInitiated(agencyTrackingId: string, paygovToken: string): Promise<void> {
    await getKnex();
    await this.query()
      .patch({
        transactionStatus: 'initiated',
        paygovToken,
      })
      .where('agencyTrackingId', agencyTrackingId);
  }

  static async findByPaygovToken(token: string): Promise<TransactionModel | undefined> {
    await getKnex();
    return TransactionModel.query().findOne({ paygovToken: token });
  }

  static async findPendingOrProcessedByReferenceId(
    clientName: string,
    transactionReferenceId: string,
    excludeToken: string,
  ): Promise<TransactionModel | undefined> {
    await getKnex();
    return TransactionModel.query()
      .whereIn('transactionStatus', ['pending', 'processed'])
      .where('clientName', clientName)
      .where('transactionReferenceId', transactionReferenceId)
      .whereNot('paygovToken', excludeToken)
      .first();
  }

  static async updateToFailed(agencyTrackingId: string): Promise<void> {
    await getKnex();
    await this.query()
      .patch({
        transactionStatus: 'failed',
        paymentStatus: 'failed',
      })
      .where('agencyTrackingId', agencyTrackingId);
  }
}
