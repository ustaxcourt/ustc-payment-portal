import TransactionModel from "../db/TransactionModel";
import { TransactionPaymentStatusResponseSchema } from "@schemas/TransactionPaymentStatus.schema";
import type { AppContext } from "@appTypes/AppContext";
import type { TransactionPaymentStatusResponse } from "@appTypes/TransactionPaymentStatus";

export type GetTransactionPaymentStatus = (
	appContext: AppContext,
) => Promise<TransactionPaymentStatusResponse>;

/**
 * Returns aggregate counts grouped by payment status.
 */
export const getTransactionPaymentStatus: GetTransactionPaymentStatus = async (
	_appContext: AppContext,
) => {
	const totals = await TransactionModel.getAggregatedPaymentStatus();

	return TransactionPaymentStatusResponseSchema.parse(totals);
};
