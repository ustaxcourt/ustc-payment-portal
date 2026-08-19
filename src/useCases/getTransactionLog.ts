import TransactionModel from "../db/TransactionModel";
import { TransactionLogResponseSchema } from "@schemas/TransactionLog.schema";
import type { AppContext } from "@appTypes/AppContext";
import type {
  TransactionLogQuery,
  TransactionLogResponse,
} from "@appTypes/TransactionLog";
import type { CourtPeriodName } from "@utils/courtDayBounds";
import { courtDayBounds, courtPeriodBounds } from "@utils/courtDayBounds";
import { toApiPaymentMethod } from "@utils/toApiPaymentMethod";

export type GetTransactionLog = (
  appContext: AppContext,
  query: TransactionLogQuery,
) => Promise<TransactionLogResponse>;

export const getTransactionLog: GetTransactionLog = async (
  _appContext: AppContext,
  query: TransactionLogQuery,
): Promise<TransactionLogResponse> => {
  const today = courtDayBounds();
  const from = query.from ?? today.start;
  const to = query.to ?? today.end;

  // Export pages after the first skip the COUNTs; the caller has them from page 1.
  const withCounts = !query.export || query.page === 1;


  const periods = courtPeriodBounds();

  const [page, counts, periodTotals] = await Promise.all([
    TransactionModel.queryLog({
      from,
      to,
      status: query.status,
      sort: query.sort,
      order: query.order,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
      withTotal: withCounts,
    }),
    withCounts ? TransactionModel.countsInRange(from, to) : undefined,
    query.includeTotals ? TransactionModel.totalsToDate(periods) : undefined,
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
    sort: query.sort,
    order: query.order,
    // Spread, so the key is absent rather than present-and-undefined.
    ...(totalsByPeriod && { totals: totalsByPeriod }),
  });
};
