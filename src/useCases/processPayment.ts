import { ZodError } from "zod";
import type { AppContext } from "@appTypes/AppContext";
import { CompleteOnlineCollectionWithDetailsRequest } from "@entities/CompleteOnlineCollectionWithDetailsRequest";
import type { ProcessPaymentRequest } from "@appTypes/ProcessPaymentRequest";
import { ProcessPaymentResponse } from "@schemas/ProcessPayment.schema";
import { ConflictError } from "@errors/conflict";
import { FailedTransactionError } from "@errors/failedTransaction";
import { GoneError } from "@errors/gone";
import { NotFoundError } from "@errors/notFound";
import { PayGovError } from "@errors/payGovError";
import { ServerError } from "@errors/serverError";
import { parseTransactionStatus } from "./parseTransactionStatus";
import { derivePaymentStatusFromSingleTransaction } from "@utils/derivePaymentStatus";
import type { ClientPermission } from "@appTypes/ClientPermission";
import TransactionModel from "../db/TransactionModel";
import { getFeeById } from "../config/fees";
import { toPaymentMethod } from "@utils/toPaymentMethod";
import { toTransactionRecordSummary } from "@utils/toTransactionRecordSummary";
import { safeUpdateToFailed } from "@utils/safeUpdateToFailed";
import { getPostgresErrorCode, isClaimContentionError } from "../db/pgErrors";
import { authorizeClient } from "../authorizeClient";
import { emitProcessPaymentConflictMetric } from "../health/processPaymentConcurrencyMetric";
import { emitPayGovErrorMetric } from "../health/payGovHealthMetric";

export type ProcessPayment = (
  appContext: AppContext,
  params: {
    client: ClientPermission;
    request: ProcessPaymentRequest;
  },
) => Promise<ProcessPaymentResponse>;

const PAYGOV_RETRY_MESSAGE =
  "We could not complete this transaction with Pay.gov. Please retry the request.";

type ProcessPaymentLogFields = {
  token: string;
  agencyTrackingId: string;
  transactionReferenceId: string;
  clientName: string;
  metadata?: Record<string, string> | null;
};

type AuthorizedProcessPaymentContext = {
  fee: NonNullable<Awaited<ReturnType<typeof FeesModel.getFeeById>>>;
  baseLogFields: ProcessPaymentLogFields;
};

const buildLogFields = (
  request: ProcessPaymentRequest,
  transaction: TransactionModel,
): ProcessPaymentLogFields => ({
  token: request.token,
  agencyTrackingId: transaction.agencyTrackingId,
  transactionReferenceId: transaction.transactionReferenceId,
  clientName: transaction.clientName,
  metadata: transaction.metadata,
});

const loadAuthorizedContext = async (
  appContext: AppContext,
  client: ClientPermission,
  request: ProcessPaymentRequest,
): Promise<AuthorizedProcessPaymentContext> => {
  const existingTransaction = await TransactionModel.findByPaygovToken(
    request.token,
  );
  if (!existingTransaction) {
    throw new NotFoundError("Transaction could not be found");
  }

  const baseLogFields = buildLogFields(request, existingTransaction);

  let fee: Awaited<ReturnType<typeof FeesModel.getFeeById>>;
  try {
    fee = await FeesModel.getFeeById(existingTransaction.feeId);
  } catch (err) {
    appContext.logger.error("Fee lookup failed", {
      ...baseLogFields,
      errorName: err instanceof Error ? err.name : undefined,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  if (!fee) {
    appContext.logger.error("Fee not found for transaction", {
      ...baseLogFields,
    });
    await safeUpdateToFailed(
      appContext,
      existingTransaction.agencyTrackingId,
      undefined,
      "Fee configuration not found for this transaction",
    );
    throw new NotFoundError("Fee configuration not found for this transaction");
  }
  if (!fee.tcsAppId) {
    appContext.logger.error("Fee is missing tcsAppId configuration", {
      ...baseLogFields,
      feeKey: fee.feeKey,
    });
    await safeUpdateToFailed(
      appContext,
      existingTransaction.agencyTrackingId,
      undefined,
      "Fee is missing tcsAppId configuration",
    );
    throw new ServerError();
  }

  authorizeClient(client, fee.feeKey);

  return { fee, baseLogFields };
};

const claimProcessingTransaction = async (
  appContext: AppContext,
  token: string,
  baseLogFields: ProcessPaymentLogFields,
): Promise<TransactionModel> => {
  try {
    const claimed = await TransactionModel.claimForProcessing(token);
    if (!claimed) {
      throw new NotFoundError("Transaction could not be found");
    }
    return claimed;
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof GoneError) {
      throw err;
    }
    if (err instanceof ConflictError) {
      emitProcessPaymentConflictMetric("claim_in_progress");
      throw err;
    }
    if (isClaimContentionError(err)) {
      const postgresErrorCode = getPostgresErrorCode(err);
      emitProcessPaymentConflictMetric(
        postgresErrorCode === "40P01" ? "deadlock" : "lock_not_available",
      );
      appContext.logger.info(
        "processPayment claim rejected — concurrent request",
        {
          ...baseLogFields,
          postgresErrorCode,
        },
      );
      throw new ConflictError(ConflictError.PAYMENT_IN_FLIGHT_MESSAGE);
    }
    throw err;
  }
};

export const processPayment: ProcessPayment = async (
  appContext: AppContext,
  { client, request },
) => {
  appContext.logger.debug("Received processPayment request", {
    token: request.token,
  });

  const { fee, baseLogFields } = await loadAuthorizedContext(
    appContext,
    client,
    request,
  );

  const transaction = await claimProcessingTransaction(
    appContext,
    request.token,
    baseLogFields,
  );

  appContext.logger.info("Loaded processPayment request context", {
    ...baseLogFields,
    feeKey: fee.feeKey,
    requestParameters: {
      token: request.token,
    },
  });

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

    /* istanbul ignore next: This branch is for Pay.gov communication failures, which are rare in normal operation */
    appContext.logger.error("Error communicating with Pay.gov", {
      ...baseLogFields,
      feeKey: fee.feeKey,
      errorName: err instanceof Error ? err.name : undefined,
      errorMessage: err instanceof Error ? err.message : String(err),
    });

    emitPayGovErrorMetric();
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
      "processing",
    );
  } catch (err) {
    if (err instanceof ConflictError) {
      emitProcessPaymentConflictMetric("persist_race");
      appContext.logger.warn("Pay.gov response not persisted — state changed", {
        ...baseLogFields,
        feeKey: fee.feeKey,
        paygovTrackingId: result.paygov_tracking_id,
        parsedStatus,
        paymentStatus,
      });
      throw err;
    }

    /* istanbul ignore next: This branch is for database failures, which are rare in normal operation */
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
