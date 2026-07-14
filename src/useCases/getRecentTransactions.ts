import type { AppContext } from "@appTypes/AppContext";
import type { RecentTransactionsResponse } from "@appTypes/RecentTransactions";
import { RecentTransactionsResponseSchema } from "@schemas/RecentTransactions.schema";
import { toApiPaymentMethod } from "@utils/toApiPaymentMethod";
import TransactionModel from "../db/TransactionModel";

export type GetRecentTransactions = (
	appContext: AppContext,
) => Promise<RecentTransactionsResponse>;

/**
 * Returns up to 100 most recent transactions across all payment statuses.
 */
export const getRecentTransactions: GetRecentTransactions = async (
	_appContext: AppContext,
) => {
	const data = await TransactionModel.getAll();
	return RecentTransactionsResponseSchema.parse({
		data: data.map((row) => ({
			...row,
			paymentMethod: toApiPaymentMethod(row.paymentMethod),
		})),
		total: data.length,
	});
};
