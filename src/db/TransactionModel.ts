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
  transactionDate?: string | null;
  paymentDate?: string | null;
  returnCode?: number | null;
  returnDetail?: string | null;
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

  static async findByPaygovTrackingId(paygovTrackingId: string): Promise<TransactionModel | undefined> {
    await getKnex();
    return TransactionModel.query().findOne({ paygovTrackingId });
  }

  static async findByReferenceId(transactionReferenceId: string): Promise<TransactionModel[]> {
    await getKnex();
    // Order ascending by createdAt: getDetails relies on rows[0] being the earliest attempt
    // for the Fee-invariance lookup (all attempts share the same feeId, but rows[0]'s timestamp
    // is also implicitly the obligation's first-attempt timestamp).
    return TransactionModel.query()
      .where({ transactionReferenceId })
      .orderBy('createdAt', 'asc');
  }

  static async updateAfterPayGovResponse(
    agencyTrackingId: string,
    paygovTrackingId: string,
    transactionStatus: TransactionStatus,
    paymentStatus: PaymentStatus,
    paymentMethod: PaymentMethod | null,
    transactionDate: string | undefined,
    paymentDate: string | undefined,
  ): Promise<TransactionModel> {
    await getKnex();
    // Skip empty dates: patching "" into a TIMESTAMP corrupts it; undefined would null an existing value.
    return this.query()
      .patchAndFetchById(agencyTrackingId, {
        paygovTrackingId,
        transactionStatus,
        paymentStatus,
        paymentMethod,
        ...(transactionDate && { transactionDate }),
        ...(paymentDate && { paymentDate }),
      });
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

  // Returns any non-terminal attempt for the given (clientName, transactionReferenceId).
  // Used by initPayment as the app-level pre-check; the status set here MUST stay aligned
  // with the partial unique index `idx_transactions_unique_active` so the app-level check
  // and the DB-level guarantee cover the same scope.
  static async findInFlightByReferenceId(
    clientName: string,
    transactionReferenceId: string,
  ): Promise<TransactionModel | undefined> {
    await getKnex();
    return TransactionModel.query()
      .where('clientName', clientName)
      .where('transactionReferenceId', transactionReferenceId)
      .whereIn('transactionStatus', ['received', 'initiated', 'pending'])
      .first();
  }

  static async updateToFailed(
    agencyTrackingId: string,
    returnCode?: number,
    returnDetail?: string,
  ): Promise<TransactionModel> {
    await getKnex();
    return this.query()
      .patchAndFetchById(agencyTrackingId, {
        transactionStatus: 'failed',
        paymentStatus: 'failed',
        returnCode,
        returnDetail,
      });
  }

  // TODO: [Future Ticket] Implement findByTransactionReferenceId to retrieve
  // all transaction attempts for a given transactionReferenceId. This is needed
  // to populate the full transactions array in the process payment response.
  // Until then, the response wraps the single current transaction in a one-element array.
}
