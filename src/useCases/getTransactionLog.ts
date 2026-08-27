import TransactionModel from "../db/TransactionModel";
import {
  TRANSACTION_LOG_DEFAULT_ORDER,
  TRANSACTION_LOG_DEFAULT_SORT,
  TransactionLogResponseSchema,
} from "@schemas/TransactionLog.schema";
import type { AppContext } from "@appTypes/AppContext";
import type {
  TransactionLogQuery,
  TransactionLogResponse,
} from "@appTypes/TransactionLog";
import type { CourtPeriodName } from "@utils/courtDayBounds";
import {
  courtDayBounds,
  courtPeriodBounds,
  courtYearEarlier,
} from "@utils/courtDayBounds";
import { toApiPaymentMethod } from "@utils/toApiPaymentMethod";

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
  // The same periods a Court year earlier, run to the corresponding instant,
  // so each comparison is to-date against to-date.
  const priorYearPeriods =
    withCounts && query.includePriorYearTotals
      ? courtPeriodBounds(courtYearEarlier(now))
      : undefined;

  const [page, counts, periodTotals, priorYearTotals, earliestRecordAt] =
    await Promise.all([
      TransactionModel.queryLog({
        from,
        to,
        status: query.status,
        sort,
        order,
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize,
        withTotal: withCounts,
      }),
      withCounts ? TransactionModel.countsInRange(from, to) : undefined,
      // Behind the same gate: each page would otherwise re-run the aggregate and
      // close its periods at a different `now`, so an export would carry a
      // slightly different set of figures on every page.
      periods ? TransactionModel.totalsToDate(periods) : undefined,
      priorYearPeriods
        ? TransactionModel.totalsToDate(priorYearPeriods)
        : undefined,
      priorYearPeriods ? TransactionModel.earliestRecordAt() : undefined,
    ]);

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
    Object.fromEntries(
      Object.entries(periods).map(([name, bounds]) => [
        name,
        {
          from: bounds.start.toISOString(),
          to: bounds.end.toISOString(),
          total: periodTotals[name as CourtPeriodName],
        },
      ]),
    );

  const priorYearTotalsByPeriod =
    priorYearPeriods &&
    priorYearTotals &&
    Object.fromEntries(
      Object.entries(priorYearPeriods).map(([name, bounds]) => [
        name,
        {
          from: bounds.start.toISOString(),
          to: bounds.end.toISOString(),
          total: priorYearTotals[name as CourtPeriodName],
          // A period opening before the first recorded transaction is a
          // coverage gap: its $0 would read as a real figure on the dashboard.
          hasData:
            earliestRecordAt != null &&
            earliestRecordAt.getTime() <= bounds.start.getTime(),
        },
      ]),
    );

  return TransactionLogResponseSchema.parse({
    data: page.rows.map((row) => ({
      ...row,
      paymentMethod: toApiPaymentMethod(row.paymentMethod),
    })),
    ...countsAndTotal,
    from: from.toISOString(),
    to: to.toISOString(),
    page: query.page,
    pageSize: query.pageSize,
    // The resolved pair, so the response echoes what was actually applied.
    sort,
    order,
    // Spread, so the key is absent rather than present-and-undefined.
    ...(totalsByPeriod && { totals: totalsByPeriod }),
    ...(priorYearTotalsByPeriod && {
      priorYearTotals: priorYearTotalsByPeriod,
    }),
  });
};
