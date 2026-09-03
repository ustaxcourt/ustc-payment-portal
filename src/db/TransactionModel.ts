import { ConflictError } from "@errors/conflict";
import { GoneError } from "@errors/gone";
import type { FeeKey } from "@schemas/FeeKey.schema";
import type { DbPaymentMethod } from "@schemas/PaymentMethod.schema";
import { DbPaymentMethodSchema } from "@schemas/PaymentMethod.schema";
import type { PaymentStatus } from "@schemas/PaymentStatus.schema";
import type {
  SortOrder,
  TransactionLogMetadataKey,
  TransactionLogSortField,
} from "@schemas/TransactionLog.schema";
import type { TransactionStatus as SchemaTransactionStatus } from "@schemas/TransactionStatus.schema";
import type { Bounds, CourtPeriodName } from "@utils/courtDayBounds";
import type { Knex } from "knex";
import { Model } from "objection";
import { MAX_TOKEN_AGE_MS } from "@/config/constants";
import { getActiveFee } from "../config/fees";
import { getKnex } from "./knex";
import { transactionLogOrderBy } from "./transactionLogSort";

export type TransactionStatus = SchemaTransactionStatus;
export type { PaymentStatus };

export type AggregatedPaymentStatus = Record<PaymentStatus, number> & {
  total: number;
};

export type TransactionLogFilter = {
  from: Date;
  to: Date;
  status?: PaymentStatus;
  fee?: FeeKey;
  paymentMethod?: DbPaymentMethod;
  transactionStatus?: SchemaTransactionStatus;
  /** Key and value are one field, so the half-supplied state cannot be built. */
  metadataSearch?: { key: TransactionLogMetadataKey; value: string };
  sort: TransactionLogSortField;
  order: SortOrder;
  limit: number;
  offset: number;
  /** False skips the COUNT behind `total`. */
  withTotal?: boolean;
};

/** Max age before a stuck `processing` row is treated as abandoned (Lambda timeout, crash). */
export const PROCESSING_STALE_MS = 600_000;

export const isStaleProcessingTransaction = (row: {
  transactionStatus?: SchemaTransactionStatus | null;
  lastUpdatedAt: string;
}): boolean => {
  if (row.transactionStatus !== "processing") {
    return false;
  }
  const ageMs = Date.now() - new Date(row.lastUpdatedAt).getTime();
  return ageMs >= PROCESSING_STALE_MS;
};

const SIBLING_GONE_MESSAGE =
  "This token is no longer valid. Another transaction is already fulfilling this obligation. Use the getDetails API to check the current status.";

const TOKEN_NO_LONGER_VALID_MESSAGE = "This token is no longer valid.";

const TOKEN_EXPIRED_MESSAGE =
  "Transaction token has expired. Retry POST /init with the same transactionReferenceId to obtain a new token.";

const VALID_DB_PAYMENT_METHODS = new Set<string>(DbPaymentMethodSchema.options);

export default class TransactionModel extends Model {
  agencyTrackingId!: string;
  paygovTrackingId?: string | null;
  fee!: string; // Stable fee key (e.g. "PETITION_FILING_FEE").
  feeName?: string;
  clientName!: string;
  transactionReferenceId!: string;
  paymentStatus!: PaymentStatus;
  transactionStatus?: TransactionStatus | null;
  paygovToken?: string | null;
  paymentMethod?: DbPaymentMethod | null;
  transactionAmount!: number;
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

  $parseDatabaseJson(json: Record<string, unknown>): Record<string, unknown> {
    const parsed = super.$parseDatabaseJson(json);
    if (
      parsed.transactionAmount !== undefined &&
      parsed.transactionAmount !== null
    ) {
      parsed.transactionAmount = Number(parsed.transactionAmount);
    }
    if (parsed.paymentMethod !== undefined && parsed.paymentMethod !== null) {
      // The column is a plain varchar with no DB-level enum/CHECK constraint,
      // so a legacy row or manual edit could hold a value outside the union.
      if (!VALID_DB_PAYMENT_METHODS.has(parsed.paymentMethod as string)) {
        throw new Error(
          `Unknown payment method: ${parsed.paymentMethod as string}`,
        );
      }
    }
    return parsed;
  }

  // Fees are hardcoded into the codebase, new ones are versioned according
  // to fee key & activation date, with the latest date accepted as the active fee.
  static async getByPaymentStatus(
    paymentStatus: PaymentStatus,
  ): Promise<TransactionModel[]> {
    await getKnex();
    const rows = await TransactionModel.query()
      .where("paymentStatus", paymentStatus)
      .orderBy("createdAt", "desc")
      .limit(100);

    return rows.map(TransactionModel.attachFeeName);
  }

  static async getAll(): Promise<TransactionModel[]> {
    await getKnex();
    const rows = await TransactionModel.query()
      .orderBy("createdAt", "desc")
      .limit(100);

    return rows.map(TransactionModel.attachFeeName);
  }

  /** One page plus the total matching the same filter. Ordered by the caller's
   *  sort, defaulting to lastUpdatedAt — the column the timeframe also filters
   *  on — and always broken by the primary key so the order is total. */
  static async queryLog(
    filter: TransactionLogFilter,
  ): Promise<{ rows: TransactionModel[]; total?: number }> {
    await getKnex();

    const base = () => {
      let query = TransactionModel.query()
        .where("lastUpdatedAt", ">=", filter.from)
        .andWhere("lastUpdatedAt", "<", filter.to);

      if (filter.status) query = query.andWhere("paymentStatus", filter.status);
      if (filter.fee) query = query.andWhere("fee", filter.fee);
      if (filter.paymentMethod) {
        query = query.andWhere("paymentMethod", filter.paymentMethod);
      }
      if (filter.transactionStatus) {
        query = query.andWhere("transactionStatus", filter.transactionStatus);
      }
      if (filter.metadataSearch) {
        // Escape LIKE wildcards so the value matches literally; `\` is ILIKE's
        // default escape char. The key is a closed-list enum, never free text.
        const escaped = filter.metadataSearch.value.replace(/[\\%_]/g, "\\$&");
        query = query.whereRaw("metadata ->> ? ILIKE ?", [
          filter.metadataSearch.key,
          `%${escaped}%`,
        ]);
      }

      return query;
    };

    const ordered = transactionLogOrderBy(filter.sort, filter.order).reduce(
      (query, clause) =>
        clause.kind === "raw"
          ? query.orderByRaw(clause.sql, clause.bindings)
          : query.orderBy(clause.column, clause.order),
      base(),
    );

    const [rows, total] = await Promise.all([
      ordered.limit(filter.limit).offset(filter.offset),
      filter.withTotal === false ? undefined : base().resultSize(),
    ]);

    return { rows: rows.map(TransactionModel.attachFeeName), total };
  }

  /** Counts per status in a timeframe. Takes no filter at all — status, fee,
   *  paymentMethod, and transactionStatus — so all four tallies stay visible
   *  regardless of what queryLog's request is currently filtered by. */
  static async countsInRange(
    from: Date,
    to: Date,
  ): Promise<AggregatedPaymentStatus> {
    await getKnex();
    const rows = await TransactionModel.query()
      .select("paymentStatus")
      .count("* as count")
      .where("lastUpdatedAt", ">=", from)
      .andWhere("lastUpdatedAt", "<", to)
      .groupBy("paymentStatus");

    return TransactionModel.tallyByStatus(rows);
  }

  /** Summed `transactionAmount` per period, successful payments only. Bounds on
   *  `lastUpdatedAt` to match queryLog/countsInRange, so a row falls in the same
   *  period in the table and in the totals. One filtered SUM per period keeps it
   *  to a single round trip. */
  static async totalsToDate(
    periods: Record<CourtPeriodName, Bounds>,
  ): Promise<Record<CourtPeriodName, number>> {
    const knex = await getKnex();
    const names = Object.keys(periods) as CourtPeriodName[];

    const earliestStart = new Date(
      Math.min(...names.map((name) => periods[name].start.getTime())),
    );
    const latestEnd = new Date(
      Math.max(...names.map((name) => periods[name].end.getTime())),
    );

    // Identifiers go through ?? bindings so the snake_case mapper applies.
    const sums = names.map((name) =>
      knex.raw("coalesce(sum(??) filter (where ?? >= ? and ?? < ?), 0) as ??", [
        "transactionAmount",
        "lastUpdatedAt",
        periods[name].start,
        "lastUpdatedAt",
        periods[name].end,
        name,
      ]),
    );

    const [row] = await TransactionModel.query()
      .select(sums)
      .where("paymentStatus", "success")
      .andWhere("lastUpdatedAt", ">=", earliestStart)
      .andWhere("lastUpdatedAt", "<", latestEnd);

    // decimal(12,2) arrives as a string from pg, as it does on the model itself.
    const summed = row as unknown as Record<string, unknown> | undefined;
    return names.reduce(
      (totals, name) => {
        // COALESCE guarantees a value for every period, so a missing one means
        // the alias did not survive the snake_case round trip. Fail loudly
        // rather than report $0 revenue.
        const value = summed?.[name];
        const total = Number(value);
        if (value === null || Number.isNaN(total)) {
          throw new Error(
            `totalsToDate returned no usable total for the "${name}" period`,
          );
        }
        totals[name] = total;
        return totals;
      },
      {} as Record<CourtPeriodName, number>,
    );
  }

  /** Status counts and per-fee success tallies from one SELECT grouped by
   *  (paymentStatus, fee): both aggregates read the same statement snapshot,
   *  so `counts.success` always equals the summed tally quantities. Bounds on
   *  `lastUpdatedAt` and takes no filter, matching countsInRange. */
  static async countsAndFeeBreakdownInRange(
    from: Date,
    to: Date,
  ): Promise<{
    counts: AggregatedPaymentStatus;
    tallies: Array<{ fee: string; qty: number; subtotal: number }>;
  }> {
    await getKnex();
    const rows = await TransactionModel.query()
      .select("paymentStatus", "fee")
      .count("* as qty")
      .sum("transactionAmount as subtotal")
      .where("lastUpdatedAt", ">=", from)
      .andWhere("lastUpdatedAt", "<", to)
      .groupBy("paymentStatus", "fee");

    const counts: AggregatedPaymentStatus = {
      success: 0,
      failed: 0,
      pending: 0,
      total: 0,
    };
    const tallies: Array<{ fee: string; qty: number; subtotal: number }> = [];

    // count and decimal(12,2) arrive as strings from pg; an unusable value
    // fails loudly rather than reporting a silent $0 for a fee with revenue.
    // The subtotal is only checked on success groups: the breakdown discards
    // the others, and a bad value there must not fail the whole request.
    for (const row of rows as unknown as Array<Record<string, unknown>>) {
      const paymentStatus = row.paymentStatus;
      const fee = String(row.fee);
      const qty = Number(row.qty);
      if (Number.isNaN(qty)) {
        throw new Error(
          `countsAndFeeBreakdownInRange returned no usable count for the "${fee}" fee`,
        );
      }

      if (
        paymentStatus === "success" ||
        paymentStatus === "failed" ||
        paymentStatus === "pending"
      ) {
        counts[paymentStatus] += qty;
        counts.total += qty;
      }

      if (paymentStatus === "success") {
        const subtotal = Number(row.subtotal);
        if (row.subtotal === null || Number.isNaN(subtotal)) {
          throw new Error(
            `countsAndFeeBreakdownInRange returned no usable tally for the "${fee}" fee`,
          );
        }
        tallies.push({ fee, qty, subtotal });
      }
    }

    return { counts, tallies };
  }

  private static tallyByStatus(
    rows: Array<{ paymentStatus?: string; count?: unknown }>,
  ): AggregatedPaymentStatus {
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
        const count = Number(row.count ?? 0);
        totals[paymentStatus] = count;
        totals.total += count;
      }
    });

    return totals;
  }

  private static attachFeeName(row: TransactionModel): TransactionModel {
    const activeFee = getActiveFee(row.fee, row.createdAt);
    row.feeName = activeFee.name;
    return row;
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

      /* istanbul ignore next */
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
    data: Partial<TransactionModel> & { transactionAmount: number },
  ): Promise<TransactionModel> {
    await getKnex();
    const newTransaction = await TransactionModel.query().insertAndFetch({
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
    await TransactionModel.query()
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
    // for the Fee-invariance lookup (all attempts share the same fee, but rows[0]'s timestamp
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
    paymentMethod: DbPaymentMethod | null,
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
      const updated = await TransactionModel.query().patchAndFetchById(
        agencyTrackingId,
        patch,
      );
      if (!updated) {
        throw new ConflictError(ConflictError.PERSIST_RACE_MESSAGE);
      }
      return updated;
    }

    const updated = (await TransactionModel.query()
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

  // Returns an already-paid attempt ('pending' = settling, 'processed' = settled) for the
  // obligation. 'failed' is excluded so a customer can retry after a decline. `excludeToken`
  // finds a sibling row under a different token — omit it when the caller has no token yet.
  static async findPendingOrProcessedByReferenceId(
    clientName: string,
    transactionReferenceId: string,
    {
      excludeToken,
      trx,
    }: { excludeToken?: string; trx?: Knex.Transaction } = {},
  ): Promise<TransactionModel | undefined> {
    await getKnex();
    const query = TransactionModel.query(trx)
      .whereIn("transactionStatus", ["pending", "processed"])
      .where("clientName", clientName)
      .where("transactionReferenceId", transactionReferenceId);

    if (excludeToken !== undefined) {
      query.whereNot("paygovToken", excludeToken);
    }

    // The index permits only one such row; ordering keeps the logged attempt deterministic
    // for any pre-migration data that predates the constraint.
    return query.orderBy("createdAt", "asc").first();
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
      const row = await TransactionModel.query(trx)
        .where({ paygovToken })
        .forUpdate()
        .noWait()
        .first();

      if (!row) {
        return undefined;
      }

      const sibling = await TransactionModel.findPendingOrProcessedByReferenceId(
        row.clientName,
        row.transactionReferenceId,
        { excludeToken: paygovToken, trx },
      );

      if (sibling) {
        throw new GoneError(SIBLING_GONE_MESSAGE);
      }

      if (row.transactionStatus === "processing") {
        if (!isStaleProcessingTransaction(row)) {
          throw new ConflictError(ConflictError.PAYMENT_IN_FLIGHT_MESSAGE);
        }
      } else if (row.transactionStatus !== "initiated") {
        throw new GoneError(TOKEN_NO_LONGER_VALID_MESSAGE);
      }

      // Reached only for a fresh `initiated` row or a stale `processing` reclaim.
      // Pay.gov's token TTL applies uniformly to both regardless of our internal
      // transactionStatus — checked once here, after all more-specific Gone/Conflict
      // reasons have had priority.
      const tokenAgeMs = Date.now() - new Date(row.createdAt).getTime();
      if (tokenAgeMs > MAX_TOKEN_AGE_MS) {
        throw new GoneError(TOKEN_EXPIRED_MESSAGE);
      }

      // Re-touch the row so last_updated_at refreshes (DB trigger) and this request
      // owns the completion attempt.
      return TransactionModel.query(trx).patchAndFetchById(row.agencyTrackingId, {
        transactionStatus: "processing",
      });
    });
  }

  // Returns the in-flight attempt for the obligation, if one exists. Scoped by clientName to
  // match `idx_transactions_unique_active`, which is the actual enforcement mechanism; 'received'
  // is not checked here because the index is the sole guard for that window.
  static async findInFlightByReferenceId(
    clientName: string,
    transactionReferenceId: string,
  ): Promise<TransactionModel | undefined> {
    await getKnex();
    return TransactionModel.query()
      .where("clientName", clientName)
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
    return TransactionModel.query().patchAndFetchById(agencyTrackingId, {
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
