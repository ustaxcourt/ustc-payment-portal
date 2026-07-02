import TransactionModel from "../db/TransactionModel";
import { RecentTransactionsResponseSchema } from "@schemas/RecentTransactions.schema";
import type { AppContext } from "@appTypes/AppContext";
import type { RecentTransactionsResponse } from "@appTypes/RecentTransactions";
import { toApiPaymentMethod } from "@utils/toApiPaymentMethod";

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
    data: data.map((row) => ({ ...row, paymentMethod: toApiPaymentMethod(row.paymentMethod) })),
    total: data.length,
  });
};

