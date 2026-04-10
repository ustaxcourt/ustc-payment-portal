import TransactionModel from "../db/TransactionModel";
import { RecentTransactionsResponseSchema } from "../schemas/RecentTransactions.schema";
import { AppContext } from "../types/AppContext";
import { RecentTransactionsResponse } from "../types/RecentTransactions";

export type GetRecentTransactions = (
  appContext: AppContext
) => Promise<RecentTransactionsResponse>;

/**
 * Returns up to 100 most recent transactions across all payment statuses.
 */
export const getRecentTransactions: GetRecentTransactions = async (
  _appContext: AppContext,
) => {
  const data = await TransactionModel.getAll();
  return RecentTransactionsResponseSchema.parse({
    data,
    total: data.length,
  });
};
