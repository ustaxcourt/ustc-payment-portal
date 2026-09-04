import { getFeeNamesByKey } from "../config/fees";
import TransactionModel from "../db/TransactionModel";
import {
  TRANSACTION_LOG_DEFAULT_ORDER,
  TRANSACTION_LOG_DEFAULT_SORT,
  TransactionLogResponseSchema,
} from "@schemas/TransactionLog.schema";
import type { AppContext } from "@appTypes/AppContext";
import type {
  TransactionFeeBreakdown,
  TransactionLogQuery,
  TransactionLogResponse,
} from "@appTypes/TransactionLog";
import {
  courtDayBounds,
  courtPeriodBounds,
  mapCourtPeriods,
  previousCourtPeriodBounds,
} from "@utils/courtDayBounds";
import {
  toApiPaymentMethod,
  toDbPaymentMethod,
} from "@utils/toApiPaymentMethod";
import { logger } from "@/utils/logger";

export type GetTransactionLog = (
  appContext: AppContext,
  query: TransactionLogQuery,
) => Promise<TransactionLogResponse>;

export const getTransactionLog: GetTransactionLog = async (
  _appContext: AppContext,
  query: TransactionLogQuery,
): Promise<TransactionLogResponse> => {
  // One clock read for both, so the day they resolve to cannot differ across
  // a midnight boundary.
  const now = new Date();
  const today = courtDayBounds(now);
  const from = query.from ?? today.start;
  const to = query.to ?? today.end;
  const sort = query.sort ?? TRANSACTION_LOG_DEFAULT_SORT;
  const order = query.order ?? TRANSACTION_LOG_DEFAULT_ORDER;

  // Export pages after the first skip the COUNTs; the caller has them from page 1.
  const withCounts = !query.export || query.page === 1;

  // Resolving the periods costs eleven Intl passes, so it waits until the
  // request actually asks for them.
  const periods =
    withCounts && query.includeTotals ? courtPeriodBounds(now) : undefined;
  const previousPeriods = periods ? previousCourtPeriodBounds(now) : undefined;

  const [page, aggregates, periodTotals, previousPeriodTotals] =
    await Promise.all([
      TransactionModel.queryLog({
        from,
        to,
        status: query.status,
        fee: query.fee,
        paymentMethod: toDbPaymentMethod(query.paymentMethod),
        transactionStatus: query.transactionStatus,
        sort,
        order,
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize,
        withTotal: withCounts,
      }),
      // With the breakdown on, counts and tallies come from one statement so
      // they share a snapshot and `counts.success` always matches the summed
      // quantities. Both stay behind the export first-page gate.
      withCounts && query.includeFeeBreakdown
        ? TransactionModel.countsAndFeeBreakdownInRange(from, to)
        : withCounts
          ? TransactionModel.countsInRange(from, to).then((counts) => ({
              counts,
              tallies: undefined,
            }))
          : undefined,
      // Behind the same gate: each page would otherwise re-run the aggregate and
      // close its periods at a different `now`, so an export would carry a
      // slightly different set of figures on every page.
      periods ? TransactionModel.totalsToDate(periods) : undefined,
      previousPeriods
        ? TransactionModel.totalsToDate(previousPeriods).catch((error) => {
            logger.warn(
              { error, from, to },
              "Unable to calculate previous-period totals for YoY trends",
            );
            return undefined;
          })
        : undefined,
    ]);

  const counts = aggregates?.counts;
  const yoyTrends =
    periodTotals && previousPeriodTotals
      ? TransactionModel.yoyTrends(periodTotals, previousPeriodTotals)
      : undefined;
  const feeTallies = aggregates?.tallies;

  // One spread, so the pair can only ever be omitted together.
  const countsAndTotal =
    counts && page.total !== undefined
      ? {
          counts: {
            all: counts.total,
            success: counts.success,
            failed: counts.failed,
            pending: counts.pending,
          },
          total: page.total,
        }
      : {};

  // Each period echoes the instants actually summed; the dashboard displays
  // these rather than deriving them.
  const totalsByPeriod =
    periods &&
    periodTotals &&
    mapCourtPeriods((name) => {
      const bounds = periods[name];
      return {
        from: bounds.start.toISOString(),
        to: bounds.end.toISOString(),
        total: periodTotals[name],
      };
    });

  const feeBreakdown = feeTallies && buildFeeBreakdown(feeTallies);

  return TransactionLogResponseSchema.parse({
    data: page.rows.map((row) => ({
      ...row,
      paymentMethod: toApiPaymentMethod(row.paymentMethod),
    })),
    ...countsAndTotal,
    ...(totalsByPeriod && { totals: totalsByPeriod }),
    ...(yoyTrends && { yoyTrends }),
    from: from.toISOString(),
    to: to.toISOString(),
    page: query.page,
    pageSize: query.pageSize,
    // The resolved pair, so the response echoes what was actually applied.
    sort,
    order,
    // Spread, so the key is absent rather than present-and-undefined.
    ...(totalsByPeriod && { totals: totalsByPeriod }),
    ...(feeBreakdown && { feeBreakdown }),
  });
};

/** Zero-fills every configured fee, keeps revenue under unconfigured keys,
 *  and orders by subtotal descending. */
const buildFeeBreakdown = (
  tallies: Array<{ fee: string; qty: number; subtotal: number }>,
): TransactionFeeBreakdown => {
  const feeNames = getFeeNamesByKey();
  const talliesByFee = new Map(tallies.map((tally) => [tally.fee, tally]));

  const rows = [
    ...Object.keys(feeNames),
    ...tallies.map((tally) => tally.fee).filter((fee) => !(fee in feeNames)),
  ].map((fee) => ({
    fee,
    feeName: feeNames[fee] ?? fee,
    qty: talliesByFee.get(fee)?.qty ?? 0,
    subtotal: talliesByFee.get(fee)?.subtotal ?? 0,
  }));

  return rows.sort(
    (a, b) => b.subtotal - a.subtotal || a.feeName.localeCompare(b.feeName),
  );
};
