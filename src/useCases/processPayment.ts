import { AppContext } from "../types/AppContext";
import { CompleteOnlineCollectionWithDetailsRequest } from "../entities/CompleteOnlineCollectionWithDetailsRequest";
import { ProcessPaymentRequest } from "../types/ProcessPaymentRequest";
import { ProcessPaymentResponse } from "../schemas/ProcessPayment.schema";
import { FailedTransactionError } from "../errors/failedTransaction";
import { ForbiddenError } from "../errors/forbidden";
import { GoneError } from "../errors/gone";
import { NotFoundError } from "../errors/notFound";
import { ServerError } from "../errors/serverError";
import { parseTransactionStatus } from "./parseTransactionStatus";
import { derivePaymentStatusFromSingleTransaction } from "../utils/derivePaymentStatus";
import { ClientPermission } from "../types/ClientPermission";
import TransactionModel from "../db/TransactionModel";
import FeesModel from "../db/FeesModel";
import { toPaymentMethod } from "../utils/toPaymentMethod";
import { toTransactionRecordSummary } from "../utils/toTransactionRecordSummary";

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
    console.error(`Fee not found for feeId: ${transaction.feeId}`);
    throw new NotFoundError("Fee configuration not found for this transaction");
  }
  if (!fee.tcsAppId) {
    console.error(`Fee ${transaction.feeId} is missing tcsAppId configuration`);
    throw new ServerError();
  }

  const req = new CompleteOnlineCollectionWithDetailsRequest({
    tcsAppId: fee.tcsAppId,
    token: request.token,
  });
  console.log("processPayment request", req);

  try {
    const result = await req.makeSoapRequest(appContext);

    console.log("processPayment result", result);

    const parsedStatus = parseTransactionStatus(result.transaction_status);
    const paymentStatus =
      derivePaymentStatusFromSingleTransaction(parsedStatus);

    await TransactionModel.updateAfterPayGovResponse(
      transaction.agencyTrackingId,
      result.paygov_tracking_id,
      parsedStatus,
      paymentStatus,
      toPaymentMethod(result.payment_type),
      result.transaction_date,
      result.payment_date,
    );

    const transactions = await TransactionModel.findByReferenceId(
      transaction.transactionReferenceId,
    );

    const transactionSummaries = transactions.map((row) =>
      toTransactionRecordSummary(row),
    );

    return {
      paymentStatus,
      transactions: transactionSummaries,
    };
  } catch (err) {
    if (err instanceof FailedTransactionError) {
      await TransactionModel.updateToFailed(
        transaction.agencyTrackingId,
        err.code,
        err.message,
      );

      const transactions = await TransactionModel.findByReferenceId(
        transaction.transactionReferenceId,
      );

      const transactionSummaries = transactions.map((row) =>
        toTransactionRecordSummary(row),
      );

      return {
        paymentStatus: "failed" as const,
        transactions: transactionSummaries,
      };
    } else throw err;
  }
};
