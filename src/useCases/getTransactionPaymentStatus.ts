import TransactionModel from "../db/TransactionModel";
import { TransactionPaymentStatusResponseSchema } from "../schemas/TransactionPaymentStatus.schema";
import { AppContext } from "../types/AppContext";
import { TransactionPaymentStatusResponse } from "../types/TransactionPaymentStatus";

export type GetTransactionPaymentStatus = (
  appContext: AppContext
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
