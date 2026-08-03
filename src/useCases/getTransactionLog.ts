import TransactionModel from "../db/TransactionModel";
import { TransactionLogResponseSchema } from "@schemas/TransactionLog.schema";
import type { AppContext } from "@appTypes/AppContext";
import type {
  TransactionLogQuery,
  TransactionLogResponse,
} from "@appTypes/TransactionLog";
import { courtDayBounds } from "@utils/courtDayBounds";
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

  // Counts span the timeframe only, so the tallies hold steady while the user
  // switches between statuses.
  const [page, counts] = await Promise.all([
    TransactionModel.queryLog({
      from,
      to,
      status: query.status,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    }),
    TransactionModel.countsInRange(from, to),
  ]);

  return TransactionLogResponseSchema.parse({
    data: page.rows.map((row) => ({
      ...row,
      paymentMethod: toApiPaymentMethod(row.paymentMethod),
    })),
    counts: {
      all: counts.total,
      success: counts.success,
      failed: counts.failed,
      pending: counts.pending,
    },
    from: from.toISOString(),
    to: to.toISOString(),
    page: query.page,
    pageSize: query.pageSize,
    total: page.total,
  });
};
