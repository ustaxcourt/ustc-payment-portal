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
import { courtDayBounds } from "@utils/courtDayBounds";
import { toApiPaymentMethod, toDbPaymentMethod } from "@utils/toApiPaymentMethod";

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
  const sort = query.sort ?? TRANSACTION_LOG_DEFAULT_SORT;
  const order = query.order ?? TRANSACTION_LOG_DEFAULT_ORDER;

  // Export pages after the first skip the COUNTs; the caller has them from page 1.
  const withTotals = !query.export || query.page === 1;

  // Counts span the timeframe only, so the tallies hold steady while the user
  // switches between statuses.
  const [page, counts] = await Promise.all([
    TransactionModel.queryLog({
      from,
      to,
      status: query.status,
      fee: query.fee,
      paymentMethod: toDbPaymentMethod(query.paymentMethod),
      transactionStatus: query.transactionStatus,
      clientName: query.clientName,
      sort,
      order,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
      withTotal: withTotals,
    }),
    withTotals ? TransactionModel.countsInRange(from, to) : undefined,
  ]);

  // One spread, so the pair can only ever be omitted together.
  const totals =
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
    sort,
    order,
    total: page.total,
  });
};
