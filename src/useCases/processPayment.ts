import { AppContext } from "../types/AppContext";
import { CompleteOnlineCollectionWithDetailsRequest } from "../entities/CompleteOnlineCollectionWithDetailsRequest";
import { ProcessPaymentRequest } from "../types/ProcessPaymentRequest";
import { ProcessPaymentResponse } from "../types/ProcessPaymentResponse";
import { FailedTransactionError } from "../errors/failedTransaction";
import { ForbiddenError } from "../errors/forbidden";
import { NotFoundError } from "../errors/notFound";
import { parseTransactionStatus } from "./parseTransactionStatus";
import { ClientPermission } from "../types/ClientPermission";
import TransactionModel from "../db/TransactionModel";

export type ProcessPayment = (
  appContext: AppContext,
  params: {
    client: ClientPermission;
    request: ProcessPaymentRequest;
  },
) => Promise<ProcessPaymentResponse>;

export const processPayment: ProcessPayment = async (
  appContext: AppContext,
  { client, request },
) => {
  const transaction = await TransactionModel.findByPaygovToken(request.token);
  if (!transaction) {
    throw new NotFoundError(
      `Transaction with token '${request.token}' could not be found`,
    );
  }

  const hasAccess =
    client.allowedFeeIds.includes("*") ||
    client.allowedFeeIds.includes(transaction.feeId);
  if (!hasAccess) {
    throw new ForbiddenError(
      `You do not have access to the transaction for the requested token`,
    );
  }

  const req = new CompleteOnlineCollectionWithDetailsRequest({
    tcsAppId: "", // Required by Pay.gov SOAP schema — token alone identifies the transaction on this call
    token: request.token,
  });
  console.log("processPayment request", req);

  try {
    const result = await req.makeSoapRequest(appContext);

    console.log("processPayment result", result);

    return {
      trackingId: result.paygov_tracking_id,
      transactionStatus: parseTransactionStatus(result.transaction_status),
    };
  } catch (err) {
    if (err instanceof FailedTransactionError) {
      return {
        transactionStatus: "Failed",
        message: err.message,
        code: err.code,
      };
    } else throw err;
  }
};
