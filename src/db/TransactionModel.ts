import { Model } from 'objection';
import FeesModel from './FeesModel';
import type { PaymentStatus } from '@schemas/PaymentStatus.schema';
import type { TransactionStatus as SchemaTransactionStatus } from '@schemas/TransactionStatus.schema';
import { ConflictError } from '@errors/conflict';
import { GoneError } from '@errors/gone';
import { getKnex } from './knex';

export type TransactionStatus = SchemaTransactionStatus;
export type { PaymentStatus };

export type AggregatedPaymentStatus = Record<PaymentStatus, number> & {
  total: number;
};

export type PaymentMethod = "plastic_card" | "ach" | "paypal";

/** Max age before a stuck `processing` row is treated as abandoned (Lambda timeout, crash). */
export const PROCESSING_STALE_MS = 600_000;

export const isStaleProcessingTransaction = (
  row: {
    transactionStatus?: SchemaTransactionStatus | null;
    lastUpdatedAt: string;
  },
): boolean => {
  if (row.transactionStatus !== "processing") {
    return false;
  }
  const ageMs = Date.now() - new Date(row.lastUpdatedAt).getTime();
  return ageMs >= PROCESSING_STALE_MS;
};

const SIBLING_GONE_MESSAGE =
  "This token is no longer valid. Another transaction is already fulfilling this obligation. Use the getDetails API to check the current status.";

const TOKEN_NO_LONGER_VALID_MESSAGE = "This token is no longer valid.";

export default class TransactionModel extends Model {
  agencyTrackingId!: string;
  paygovTrackingId?: string | null;
  feeId!: string; // e.g. "PETITION_FILING_FEE_2026_03_05" — the specific fee version in effect at the time of the transaction attempt. FK to FeesModel.
  feeName?: string;
  clientName!: string;
  transactionReferenceId!: string;
  paymentStatus!: PaymentStatus;
  transactionStatus?: TransactionStatus | null;
  paygovToken?: string | null;
  paymentMethod?: PaymentMethod | null;
  transactionAmount?: number | null;
  transactionDate?: string | null;
  paymentDate?: string | null;
  returnCode?: number | null;
  returnDetail?: string | null;
  createdAt!: string;
  lastUpdatedAt!: string;
  metadata?: Record<string, string> | null;

  /* istanbul ignore next */
  static get tableName() {
    return "transactions";
  }

  /* istanbul ignore next */
  static get idColumn() {
    return "agencyTrackingId";
  }

  static get relationMappings() {
    return {
      fee: {
        relation: Model.BelongsToOneRelation,
        modelClass: FeesModel,
        join: {
          from: "transactions.feeId",
          to: "fees.feeId",
        },
      },
    };
  }

  $parseDatabaseJson(json: Record<string, unknown>): Record<string, unknown> {
    const parsed = super.$parseDatabaseJson(json);
    if (
      parsed.transactionAmount !== undefined &&
      parsed.transactionAmount !== null
    ) {
      parsed.transactionAmount = Number(parsed.transactionAmount);
    }
    return parsed;
  }

  // Fees from Fee Table will never be deleted, new ones are versioned according
  // to FeeKey & activation date, with the latest date accepted as the active fee.
  static async getByPaymentStatus(
    paymentStatus: PaymentStatus,
  ): Promise<TransactionModel[]> {
    await getKnex();
    return TransactionModel.query()
      .alias("t")
      .join("fees as f", "t.feeId", "f.feeId")
      .select("t.*", "f.name as feeName", "f.amount as transactionAmount")
      .where("t.paymentStatus", paymentStatus)
      .orderBy("t.createdAt", "desc")
      .limit(100);
  }

  static async getAll(): Promise<TransactionModel[]> {
    await getKnex();
    return TransactionModel.query()
      .alias("t")
      .join("fees as f", "t.feeId", "f.feeId")
      .select("t.*", "f.name as feeName", "f.amount as transactionAmount")
      .orderBy("t.createdAt", "desc")
      .limit(100);
  }

  static async getAggregatedPaymentStatus(): Promise<AggregatedPaymentStatus> {
    await getKnex();
    const rows = await TransactionModel.query()
      .select("paymentStatus")
      .count("* as count")
      .groupBy("paymentStatus");

    const totals: AggregatedPaymentStatus = {
      success: 0,
      failed: 0,
      pending: 0,
      total: 0,
    };

    rows.forEach((row) => {
      const paymentStatus = row.paymentStatus;

      if (
        paymentStatus === "success" ||
        paymentStatus === "failed" ||
        paymentStatus === "pending"
      ) {
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

  static async createReceived(
    data: Partial<TransactionModel>,
  ): Promise<TransactionModel> {
    await getKnex();
    const newTransaction = await this.query().insertAndFetch({
      ...data,
      paymentStatus: "pending",
      transactionStatus: "received",
    });

    return newTransaction;
  }

  static async updateToInitiated(
    agencyTrackingId: string,
    paygovToken: string,
  ): Promise<void> {
    await getKnex();
    await this.query()
      .patch({
        transactionStatus: "initiated",
        paygovToken,
      })
      .where("agencyTrackingId", agencyTrackingId);
  }

  static async findByPaygovToken(
    token: string,
  ): Promise<TransactionModel | undefined> {
    await getKnex();
    return TransactionModel.query().findOne({ paygovToken: token });
  }

  static async findByPaygovTrackingId(
    paygovTrackingId: string,
  ): Promise<TransactionModel | undefined> {
    await getKnex();
    return TransactionModel.query().findOne({ paygovTrackingId });
  }

  static async findByReferenceId(
    transactionReferenceId: string,
  ): Promise<TransactionModel[]> {
    await getKnex();
    // Order ascending by createdAt: getDetails relies on rows[0] being the earliest attempt
    // for the Fee-invariance lookup (all attempts share the same feeId, but rows[0]'s timestamp
    // is also implicitly the obligation's first-attempt timestamp).
    return TransactionModel.query()
      .where({ transactionReferenceId })
      .orderBy("createdAt", "asc");
  }

  static async updateAfterPayGovResponse(
    agencyTrackingId: string,
    paygovTrackingId: string,
    transactionStatus: TransactionStatus,
    paymentStatus: PaymentStatus,
    paymentMethod: PaymentMethod | null,
    transactionDate: string | undefined,
    paymentDate: string | undefined,
    expectedTransactionStatus?: TransactionStatus,
  ): Promise<TransactionModel> {
    await getKnex();
    const patch = {
      paygovTrackingId,
      transactionStatus,
      paymentStatus,
      paymentMethod,
      ...(transactionDate && { transactionDate }),
      ...(paymentDate && { paymentDate }),
    };

    if (expectedTransactionStatus === undefined) {
      const updated = await this.query().patchAndFetchById(
        agencyTrackingId,
        patch,
      );
      if (!updated) {
        throw new ConflictError(ConflictError.PERSIST_RACE_MESSAGE);
      }
      return updated;
    }

    const updated = (await this.query()
      .patch(patch)
      .where("agencyTrackingId", agencyTrackingId)
      .where("transactionStatus", expectedTransactionStatus)
      .returning("*")
      .first()) as TransactionModel | undefined;

    if (!updated) {
      throw new ConflictError(ConflictError.PERSIST_RACE_MESSAGE);
    }
    return updated;
  }

  static async findPendingOrProcessedByReferenceId(
    clientName: string,
    transactionReferenceId: string,
    excludeToken: string,
  ): Promise<TransactionModel | undefined> {
    await getKnex();
    return TransactionModel.query()
      .whereIn("transactionStatus", ["pending", "processed"])
      .where("clientName", clientName)
      .where("transactionReferenceId", transactionReferenceId)
      .whereNot("paygovToken", excludeToken)
      .first();
  }

  /**
   * Atomically claims an initiated transaction for Pay.gov completion.
   * Must be called before any SOAP request for the token.
   *
   * Runs inside a short DB transaction: row lock (NOWAIT) → guard checks →
   * status flip to `processing`. The connection is released before Pay.gov is called.
   *
   * @returns undefined when no row exists for the token (caller maps to NotFoundError).
   * @throws ConflictError when another request already holds or claimed the token.
   * @throws GoneError when the token is no longer valid for processing.
   * @throws Postgres lock-not-available (55P03) when NOWAIT cannot acquire the row lock.
   */
  static async claimForProcessing(
    paygovToken: string,
  ): Promise<TransactionModel | undefined> {
    const knex = await getKnex();
    return knex.transaction(async (trx) => {
      const row = await this.query(trx)
        .where({ paygovToken })
        .forUpdate()
        .noWait()
        .first();

      if (!row) {
        return undefined;
      }

      const sibling = await this.query(trx)
        .whereIn("transactionStatus", ["pending", "processed"])
        .where({
          clientName: row.clientName,
          transactionReferenceId: row.transactionReferenceId,
        })
        .whereNot("paygovToken", paygovToken)
        .first();

      if (sibling) {
        throw new GoneError(SIBLING_GONE_MESSAGE);
      }

      if (row.transactionStatus === "processing") {
        if (isStaleProcessingTransaction(row)) {
          // Stale claim: re-touch the row so last_updated_at refreshes (DB trigger) and
          // this request owns the in-flight completion attempt.
          return this.query(trx).patchAndFetchById(row.agencyTrackingId, {
            transactionStatus: "processing",
          });
        }
        throw new ConflictError(ConflictError.PAYMENT_IN_FLIGHT_MESSAGE);
      }

      if (row.transactionStatus !== "initiated") {
        throw new GoneError(TOKEN_NO_LONGER_VALID_MESSAGE);
      }

      return this.query(trx).patchAndFetchById(row.agencyTrackingId, {
        transactionStatus: "processing",
      });
    });
  }

  // Returns the in-flight attempt for the given transactionReferenceId, if one exists.
  // Checks 'initiated' and 'processing' explicitly. The partial unique index
  // `idx_transactions_unique_active` also covers 'received', 'initiated', 'processing', and
  // 'pending' — 'received' and 'pending' are intentionally not checked here; the index is the
  // sole guard for those windows.
  static async findInFlightByReferenceId(
    transactionReferenceId: string,
  ): Promise<TransactionModel | undefined> {
    await getKnex();
    return TransactionModel.query()
      .where("transactionReferenceId", transactionReferenceId)
      .whereIn("transactionStatus", ["initiated", "processing"])
      .first();
  }

  static async updateToFailed(
    agencyTrackingId: string,
    returnCode?: number,
    returnDetail?: string,
  ): Promise<TransactionModel> {
    await getKnex();
    return this.query().patchAndFetchById(agencyTrackingId, {
      transactionStatus: "failed",
      paymentStatus: "failed",
      returnCode,
      returnDetail,
    });
  }

  // TODO: [Future Ticket] Implement findByTransactionReferenceId to retrieve
  // all transaction attempts for a given transactionReferenceId. This is needed
  // to populate the full transactions array in the process payment response.
  // Until then, the response wraps the single current transaction in a one-element array.
}
