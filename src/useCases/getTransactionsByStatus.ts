import TransactionModel from "../db/TransactionModel";
import {
  TransactionsByStatusPathParamsSchema,
  TransactionsByStatusResponseSchema,
} from "../schemas/TransactionsByStatus.schema";
import { AppContext } from "../types/AppContext";
import {
  TransactionsByStatusPathParams,
  TransactionsByStatusResponse,
} from "../types/TransactionsByStatus";
import { InvalidRequestError } from "../errors/invalidRequest";

export type GetTransactionsByStatus = (
  appContext: AppContext,
  request: TransactionsByStatusPathParams
) => Promise<TransactionsByStatusResponse>;

/**
 * Returns up to 100 transactions filtered by payment status.
 */
export const getTransactionsByStatus: GetTransactionsByStatus = async (
  _appContext: AppContext,
  request: TransactionsByStatusPathParams
): Promise<TransactionsByStatusResponse> => {
  if (!isValidPaymentStatus(request.paymentStatus)) {
    throw new InvalidRequestError(
      "Invalid paymentStatus. Expected one of: success, failed, pending",
    );
  }

  const { paymentStatus } = TransactionsByStatusPathParamsSchema.parse(request);
  const data = await TransactionModel.getByPaymentStatus(paymentStatus);

  return TransactionsByStatusResponseSchema.parse({
    data,
    total: data.length,
  });
};

export const isValidPaymentStatus = (paymentStatus: string): boolean => {
  return TransactionsByStatusPathParamsSchema.shape.paymentStatus.safeParse(
    paymentStatus,
  ).success;
};
