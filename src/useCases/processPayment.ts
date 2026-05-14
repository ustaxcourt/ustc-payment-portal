import { ZodError } from "zod";
import { AppContext } from "../types/AppContext";
import { CompleteOnlineCollectionWithDetailsRequest } from "../entities/CompleteOnlineCollectionWithDetailsRequest";
import { ProcessPaymentRequest } from "../types/ProcessPaymentRequest";
import { ProcessPaymentResponse } from "../schemas/ProcessPayment.schema";
import { FailedTransactionError } from "../errors/failedTransaction";
import { GoneError } from "../errors/gone";
import { NotFoundError } from "../errors/notFound";
import { PayGovError } from "../errors/payGovError";
import { ServerError } from "../errors/serverError";
import { parseTransactionStatus } from "./parseTransactionStatus";
import { derivePaymentStatusFromSingleTransaction } from "../utils/derivePaymentStatus";
import { ClientPermission } from "../types/ClientPermission";
import TransactionModel from "../db/TransactionModel";
import FeesModel from "../db/FeesModel";
import { toPaymentMethod } from "../utils/toPaymentMethod";
import { toTransactionRecordSummary } from "../utils/toTransactionRecordSummary";
import { safeUpdateToFailed } from "../utils/safeUpdateToFailed";
import { authorizeClient } from "../authorizeClient";

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

  authorizeClient(client, transaction.feeId);

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

  let result: Awaited<ReturnType<typeof req.makeSoapRequest>>;
  try {
    result = await req.makeSoapRequest(appContext);
  } catch (err) {
    if (err instanceof FailedTransactionError) {
      await TransactionModel.updateToFailed(
        transaction.agencyTrackingId,
        err.code,
        err.message,
      );

      const failedRows = await TransactionModel.findByReferenceId(
        transaction.transactionReferenceId,
      );

      return {
        paymentStatus: "failed" as const,
        transactions: failedRows.map((row) => toTransactionRecordSummary(row)),
      };
    }

    if (err instanceof ZodError) {
      console.error(
        `Pay.gov response failed schema validation for agencyTrackingId '${transaction.agencyTrackingId}'`,
        err,
      );
      await safeUpdateToFailed(
        transaction.agencyTrackingId,
        undefined,
        "Pay.gov returned a response that failed schema validation",
      );
      throw new PayGovError(
        "We could not complete this transaction with Pay.gov. Please retry the request.",
      );
    }

    console.error(
      `Error communicating with Pay.gov for agencyTrackingId '${transaction.agencyTrackingId}'`,
      err,
    );
    await safeUpdateToFailed(
      transaction.agencyTrackingId,
      undefined,
      "Error communicating with Pay.gov",
    );
    throw new PayGovError(
      "We could not complete this transaction with Pay.gov. Please retry the request.",
    );
  }

  console.log("processPayment result", result);

  const parsedStatus = parseTransactionStatus(result.transaction_status);
  const paymentStatus = derivePaymentStatusFromSingleTransaction(parsedStatus);

  try {
    await TransactionModel.updateAfterPayGovResponse(
      transaction.agencyTrackingId,
      result.paygov_tracking_id,
      parsedStatus,
      paymentStatus,
      toPaymentMethod(result.payment_type),
      result.transaction_date,
      result.payment_date,
    );
  } catch (err) {
    console.error(
      `Failed to persist Pay.gov response for agencyTrackingId '${transaction.agencyTrackingId}'`,
      err,
    );
    await safeUpdateToFailed(
      transaction.agencyTrackingId,
      undefined,
      "Failed to persist Pay.gov response",
    );
    throw new ServerError(
      "Failed to record the payment result. Please retry the request.",
    );
  }

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
};
