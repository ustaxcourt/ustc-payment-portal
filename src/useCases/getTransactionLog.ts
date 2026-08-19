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
  const withTotals = !query.export || query.page === 1;

  // Counts span the timeframe only, so the tallies hold steady while the user
  // switches between statuses. Totals ignore it entirely — fixed periods to date.
  const periods = courtPeriodBounds();

  const [page, counts, totals] = await Promise.all([
    TransactionModel.queryLog({
      from,
      to,
      status: query.status,
      sort: query.sort,
      order: query.order,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
      withTotal: withTotals,
    }),
    TransactionModel.countsInRange(from, to),
    query.includeTotals ? TransactionModel.totalsToDate(periods) : undefined,
  ]);

  // Each period echoes the instants actually summed; the dashboard displays
  // these rather than deriving them.
  const totalsByPeriod =
    totals &&
    Object.fromEntries(
      Object.entries(periods).map(([name, bounds]) => [
        name,
        {
          from: bounds.start.toISOString(),
          to: bounds.end.toISOString(),
          total: totals[name as CourtPeriodName],
        },
      ]),
    );

  return TransactionLogResponseSchema.parse({
    data: page.rows.map((row) => ({
      ...row,
      paymentMethod: toApiPaymentMethod(row.paymentMethod),
    })),
    ...totals,
    from: from.toISOString(),
    to: to.toISOString(),
    page: query.page,
    pageSize: query.pageSize,
    sort: query.sort,
    order: query.order,
    total: page.total,
    // Spread, so the key is absent rather than present-and-undefined.
    ...(totalsByPeriod && { totals: totalsByPeriod }),
  });
};
