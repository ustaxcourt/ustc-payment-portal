import type { AppContext } from "@appTypes/AppContext";
import type { ClientPermission } from "@appTypes/ClientPermission";
import { StartOnlineCollectionRequest } from "@entities/StartOnlineCollectionRequest";
import { ConflictError } from "@errors/conflict";
import { InvalidRequestError } from "@errors/invalidRequest";
import { PayGovError } from "@errors/payGovError";
import { ServerError } from "@errors/serverError";
import type {
  InitPaymentRequest,
  InitPaymentResponse,
} from "@schemas/InitPayment.schema";
import { generateAgencyTrackingId } from "@utils/generateTrackingId";
import { safeUpdateToFailed } from "@utils/safeUpdateToFailed";
import { ZodError } from "zod";
import { authorizeClient } from "../authorizeClient";
import FeesModel from "../db/FeesModel";
import { isUniqueViolation } from "../db/pgErrors";
import TransactionModel, {
  isStaleProcessingTransaction,
} from "../db/TransactionModel";
import { FailedTransactionError } from "../errors/failedTransaction";
import { emitInitPaymentConflictMetric } from "../health/initPaymentConcurrencyMetric";
import { emitPayGovErrorMetric } from "../health/payGovHealthMetric";

const MAX_TOKEN_AGE_MS = 10800000; // 3 Hours
const EXISTING_TOKEN_ERROR_CODE = 5009; // Matches return code for existing token in Pay.gov response

export type InitPayment = (
  appContext: AppContext,
  params: {
    client: ClientPermission;
    request: InitPaymentRequest;
  },
) => Promise<InitPaymentResponse>;

export const initPayment: InitPayment = async (
  appContext,
  { client, request },
) => {
  const {
    fee: feeKey,
    amount,
    transactionReferenceId,
    urlSuccess,
    urlCancel,
  } = request;
  const { clientName } = client;

  appContext.logger.debug("Received initPayment request", {
    transactionReferenceId,
    feeKey,
    clientName,
    hasAmount: amount !== undefined,
    metadata: request.metadata,
  });

  authorizeClient(client, feeKey);

  /* istanbul ignore next */
  appContext.logger.info(
    "Authorized client for initPayment",
    /* istanbul ignore next */
    {
      transactionReferenceId,
      clientName,
      feeKey,
    },
  );

  const fee = await FeesModel.getActiveFeeByKey(feeKey);
  if (!fee || !fee.tcsAppId) {
    throw new InvalidRequestError(`Unknown fee: ${feeKey}`);
  }

  if (amount !== undefined && !fee.isVariable) {
    throw new InvalidRequestError(
      `Fee ${feeKey} does not allow variable amounts`,
    );
  }

  if (amount === undefined && fee.isVariable) {
    throw new InvalidRequestError(`Fee ${feeKey} requires an amount`);
  }

  const existingInFlightTransaction =
    await TransactionModel.findInFlightByReferenceId(transactionReferenceId);

  if (existingInFlightTransaction) {
    const tokenAgeMs =
      Date.now() -
      new Date(existingInFlightTransaction.lastUpdatedAt).getTime();
    const staleProcessing = isStaleProcessingTransaction(
      existingInFlightTransaction,
    );

    if (
      existingInFlightTransaction.transactionStatus === "processing" &&
      !staleProcessing
    ) {
      appContext.logger.info(
        "Rejecting initPayment: transaction is actively processing",
        {
          transactionReferenceId,
          agencyTrackingId: existingInFlightTransaction.agencyTrackingId,
          tokenAgeMs,
        },
      );
      emitInitPaymentConflictMetric("processing_in_flight");
      throw new ConflictError(
        ConflictError.PAYMENT_IN_FLIGHT_TRANSACTION_MESSAGE,
      );
    }

    if (
      existingInFlightTransaction.paygovToken &&
      tokenAgeMs < MAX_TOKEN_AGE_MS &&
      !staleProcessing
    ) {
      appContext.logger.info("Returning existing in-flight transaction", {
        transactionReferenceId,
        agencyTrackingId: existingInFlightTransaction.agencyTrackingId,
        tokenAgeMs,
        transactionStatus: existingInFlightTransaction.transactionStatus,
      });
      return {
        token: existingInFlightTransaction.paygovToken,
        paymentRedirect: `${process.env.PAYMENT_URL}?token=${existingInFlightTransaction.paygovToken}&tcsAppID=${fee.tcsAppId}`,
      };
    } else {
      appContext.logger.info("Existing in-flight transaction token expired", {
        transactionReferenceId,
        agencyTrackingId: existingInFlightTransaction.agencyTrackingId,
        tokenAgeMs,
        transactionStatus: existingInFlightTransaction.transactionStatus,
        staleProcessing,
      });
      await TransactionModel.updateToFailed(
        existingInFlightTransaction.agencyTrackingId,
        EXISTING_TOKEN_ERROR_CODE,
        "Existing token expired",
      );
    }
  }

  // TODO: Add a unit test for a variable fee request (when we actually have one to support)
  /* istanbul ignore next */
  const transactionAmount = fee.isVariable ? amount! : fee.amount!;
  const agencyTrackingId = generateAgencyTrackingId();

  const req = new StartOnlineCollectionRequest({
    tcsAppId: fee.tcsAppId,
    agencyTrackingId,
    transactionAmount,
    urlSuccess,
    urlCancel,
  });

  appContext.logger.info("Initiating new transaction", {
    transactionReferenceId,
    agencyTrackingId,
    transactionAmount,
    feeId: fee.feeId,
    clientName,
  });

  let result: Awaited<ReturnType<typeof req.makeSoapRequest>>;
  try {
    await TransactionModel.createReceived({
      agencyTrackingId,
      feeId: fee.feeId,
      clientName,
      transactionReferenceId,
      metadata: request.metadata,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Concurrent initPayment lost the createReceived race — the partial unique index
      // `idx_transactions_unique_active` ensures at most one in-flight attempt per
      // (clientName, transactionReferenceId). Report the same 409 as the app-level check.
      const EXISTING_IN_FLIGHT_TRANSACTION_ERROR =
        "A payment session is already in-flight for this transactionReferenceId";
      appContext.logger.error(EXISTING_IN_FLIGHT_TRANSACTION_ERROR, {
        transactionReferenceId,
        agencyTrackingId,
        clientName,
      });
      emitInitPaymentConflictMetric("persist_race");
      throw new ConflictError(EXISTING_IN_FLIGHT_TRANSACTION_ERROR);
    }

    /* istanbul ignore next */
    appContext.logger.error("Failed to record received transaction", {
      transactionReferenceId,
      agencyTrackingId,
      errorName: err instanceof Error ? err.name : undefined,
      errorMessage: err instanceof Error ? err.message : String(err),
    });

    /* istanbul ignore next */
    throw new Error(
      `Failed to record received transaction: ${err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  appContext.logger.info("Transaction received and recorded", {
    transactionReferenceId,
    agencyTrackingId,
    transactionAmount,
    feeId: fee.feeId,
    clientName,
    metadata: request.metadata,
  });

  try {
    result = await req.makeSoapRequest(appContext);
  } catch (err) {
    appContext.logger.error("Error making SOAP request to Pay.gov", {
      transactionReferenceId,
      agencyTrackingId,
      clientName,
      errorName: err instanceof Error ? err.name : undefined,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    if (!(err instanceof ZodError) && !(err instanceof FailedTransactionError)) {
      emitPayGovErrorMetric();
    }
    await safeUpdateToFailed(
      appContext,
      agencyTrackingId,
      undefined,
      "Error communicating with Pay.gov",
    );
    throw new PayGovError(
      "There was an error communicating with Pay.gov. Please retry your transaction.",
    );
  }

  try {
    await TransactionModel.updateToInitiated(agencyTrackingId, result.token);
  } catch (err) {
    /* istanbul ignore next */
    appContext.logger.error("Failed to mark transaction as initiated", {
      transactionReferenceId,
      agencyTrackingId,
      errorName: err instanceof Error ? err.name : undefined,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    await safeUpdateToFailed(appContext, agencyTrackingId);
    throw new ServerError(
      "Failed to record payment session. Please retry your transaction.",
    );
  }

  appContext.logger.info("Successfully initiated transaction", {
    transactionReferenceId,
    agencyTrackingId,
    token: result.token,
  });

  return {
    token: result.token,
    paymentRedirect: `${process.env.PAYMENT_URL}?token=${result.token}&tcsAppID=${fee.tcsAppId}`,
  };
};

