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
import { toApiPaymentMethod } from "../utils/toApiPaymentMethod";

export type GetTransactionsByStatus = (
  appContext: AppContext,
  request: TransactionsByStatusPathParams
) => Promise<TransactionsByStatusResponse>;

export type IsValidPaymentStatus = (paymentStatus: string) => boolean;

/**
 * Returns up to 100 transactions filtered by payment status.
 */
export const getTransactionsByStatus: GetTransactionsByStatus = async (
  _appContext: AppContext,
  request: TransactionsByStatusPathParams
): Promise<TransactionsByStatusResponse> => {
  const parsed = TransactionsByStatusPathParamsSchema.safeParse(request);
  if (!parsed.success) {
    throw new InvalidRequestError(
      "Invalid paymentStatus. Expected one of: success, failed, pending",
    );
  }

  const { paymentStatus } = parsed.data;
  const data = await TransactionModel.getByPaymentStatus(paymentStatus);

  return TransactionsByStatusResponseSchema.parse({
    data: data.map((row) => ({ ...row, paymentMethod: toApiPaymentMethod(row.paymentMethod) })),
    total: data.length,
  });
};

export const isValidPaymentStatus: IsValidPaymentStatus = (paymentStatus: string): boolean => {
  return TransactionsByStatusPathParamsSchema.shape.paymentStatus.safeParse(
    paymentStatus,
  ).success;
};
