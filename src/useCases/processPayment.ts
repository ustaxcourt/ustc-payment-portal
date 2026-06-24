import { ZodError } from "zod";
import type { AppContext } from "@appTypes/AppContext";
import { CompleteOnlineCollectionWithDetailsRequest } from "@entities/CompleteOnlineCollectionWithDetailsRequest";
import type { ProcessPaymentRequest } from "@appTypes/ProcessPaymentRequest";
import { ProcessPaymentResponse } from "@schemas/ProcessPayment.schema";
import { FailedTransactionError } from "@errors/failedTransaction";
import { GoneError } from "@errors/gone";
import { NotFoundError } from "@errors/notFound";
import { PayGovError } from "@errors/payGovError";
import { ServerError } from "@errors/serverError";
import { parseTransactionStatus } from "./parseTransactionStatus";
import { derivePaymentStatusFromSingleTransaction } from "@utils/derivePaymentStatus";
import type { ClientPermission } from "@appTypes/ClientPermission";
import TransactionModel from "../db/TransactionModel";
import FeesModel from "../db/FeesModel";
import { toPaymentMethod } from "@utils/toPaymentMethod";
import { toTransactionRecordSummary } from "@utils/toTransactionRecordSummary";
import { safeUpdateToFailed } from "@utils/safeUpdateToFailed";
import { authorizeClient } from "../authorizeClient";

export type ProcessPayment = (
  appContext: AppContext,
  params: {
    client: ClientPermission;
    request: ProcessPaymentRequest;
  },
) => Promise<ProcessPaymentResponse>;

const PAYGOV_RETRY_MESSAGE =
  "We could not complete this transaction with Pay.gov. Please retry the request.";

export const processPayment: ProcessPayment = async (
  appContext: AppContext,
  { client, request },
) => {
  appContext.logger.debug("Received processPayment request", {
    token: request.token,
  });

  const transaction = await TransactionModel.findByPaygovToken(request.token);
  if (!transaction) {
    throw new NotFoundError("Transaction could not be found");
  }

  const baseLogFields = {
    token: request.token,
    agencyTrackingId: transaction.agencyTrackingId,
    transactionReferenceId: transaction.transactionReferenceId,
    clientName: transaction.clientName,
    metadata: transaction.metadata,
  };

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
    appContext.logger.error("Fee not found for transaction", {
      ...baseLogFields,
    });
    throw new NotFoundError("Fee configuration not found for this transaction");
  }
  if (!fee.tcsAppId) {
    appContext.logger.error("Fee is missing tcsAppId configuration", {
      ...baseLogFields,
      feeKey: fee.feeKey,
    });
    throw new ServerError();
  }

  appContext.logger.info("Loaded processPayment request context", {
    ...baseLogFields,
    feeKey: fee.feeKey,
    requestParameters: {
      token: request.token,
    },
  });

  authorizeClient(client, fee.feeKey);

  const req = new CompleteOnlineCollectionWithDetailsRequest({
    tcsAppId: fee.tcsAppId,
    token: request.token,
  });

  appContext.logger.info(
    "Calling Pay.gov completeOnlineCollectionWithDetails",
    {
      ...baseLogFields,
      feeKey: fee.feeKey,
      tcsAppId: fee.tcsAppId,
    },
  );

  let result: Awaited<ReturnType<typeof req.makeSoapRequest>>;
  try {
    result = await req.makeSoapRequest(appContext);
  } catch (err) {
    if (err instanceof FailedTransactionError) {
      appContext.logger.error("Pay.gov returned failed transaction", {
        ...baseLogFields,
        feeKey: fee.feeKey,
        returnCode: err.code,
        returnDetail: err.message,
      });

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
      appContext.logger.error("Pay.gov response failed schema validation", {
        ...baseLogFields,
        feeKey: fee.feeKey,
        errorName: err.name,
        errorMessage: err.message,
      });

      await safeUpdateToFailed(
        appContext,
        transaction.agencyTrackingId,
        undefined,
        "Pay.gov returned a response that failed schema validation",
      );
      throw new PayGovError(PAYGOV_RETRY_MESSAGE, 502);
    }

    appContext.logger.error("Error communicating with Pay.gov", {
      ...baseLogFields,
      feeKey: fee.feeKey,
      errorName: err instanceof Error ? err.name : undefined,
      errorMessage: err instanceof Error ? err.message : String(err),
    });

    await safeUpdateToFailed(
      appContext,
      transaction.agencyTrackingId,
      undefined,
      "Error communicating with Pay.gov",
    );
    throw new PayGovError(PAYGOV_RETRY_MESSAGE);
  }

  appContext.logger.info("Received Pay.gov response", {
    ...baseLogFields,
    feeKey: fee.feeKey,
    payGovResponse: result,
  });

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
    appContext.logger.error("Failed to persist Pay.gov response", {
      ...baseLogFields,
      feeKey: fee.feeKey,
      paygovTrackingId: result.paygov_tracking_id,
      parsedStatus,
      paymentStatus,
      errorName: err instanceof Error ? err.name : undefined,
      errorMessage: err instanceof Error ? err.message : String(err),
    });

    await safeUpdateToFailed(
      appContext,
      transaction.agencyTrackingId,
      undefined,
      "Failed to persist Pay.gov response",
    );
    throw new ServerError(
      "Failed to record the payment result. Please retry the request.",
    );
  }

  const allRows = await TransactionModel.findByReferenceId(
    transaction.transactionReferenceId,
  );

  appContext.logger.info("Completed processPayment", {
    ...baseLogFields,
    feeKey: fee.feeKey,
    paygovTrackingId: result.paygov_tracking_id,
    parsedStatus,
    paymentStatus,
    transactionCount: allRows.length,
  });

  return {
    paymentStatus,
    transactions: allRows.map((row) => toTransactionRecordSummary(row)),
  };
};

