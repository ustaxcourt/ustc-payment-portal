import { AppContext } from "../types/AppContext";
import { CompleteOnlineCollectionWithDetailsRequest } from "../entities/CompleteOnlineCollectionWithDetailsRequest";
import { ProcessPaymentRequest } from "../types/ProcessPaymentRequest";
import { ProcessPaymentResponse } from "../types/ProcessPaymentResponse";
import { FailedTransactionError } from "../errors/failedTransaction";
import { ForbiddenError } from "../errors/forbidden";
import { GoneError } from "../errors/gone";
import { NotFoundError } from "../errors/notFound";
import { ServerError } from "../errors/serverError";
import { parseTransactionStatus } from "./parseTransactionStatus";
import { ClientPermission } from "../types/ClientPermission";
import TransactionModel from "../db/TransactionModel";
import FeesModel from "../db/FeesModel";

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
    throw new NotFoundError("Transaction could not be found");
  }

  const hasAccess =
    client.allowedFeeIds.includes("*") ||
    client.allowedFeeIds.includes(transaction.feeId);
  if (!hasAccess) {
    console.warn(
      `Client '${client.clientName}' attempted to process token for feeId '${transaction.feeId}' without access`,
    );
    throw new ForbiddenError(
      `You do not have access to the transaction for the requested token`,
    );
  }

  const sibling = await TransactionModel.findPendingOrProcessedByReferenceId(
    transaction.clientName,
    transaction.transactionReferenceId,
    request.token,
  );

  if (sibling) {
    throw new GoneError(
      "This token is no longer valid. Another transaction is already fulfilling this obligation. Use the getDetails API to check the current status.",
    );
  }

  if (transaction.transactionStatus !== "initiated") {
    throw new GoneError("This token is no longer valid.");
  }

  const fee = await FeesModel.getFeeById(transaction.feeId);
  if (!fee) {
    throw new NotFoundError(`Fee not found for feeId: ${transaction.feeId}`);
  }
  if (!fee.tcsAppId) {
    throw new ServerError(`Fee ${transaction.feeId} is missing tcsAppId configuration`);
  }

  const req = new CompleteOnlineCollectionWithDetailsRequest({
    tcsAppId: fee.tcsAppId,
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
        transactionStatus: "failed",
        message: err.message,
        code: err.code,
      };
    } else throw err;
  }
};
