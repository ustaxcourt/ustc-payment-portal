import type { AppContext } from "@appTypes/AppContext";
import type { ClientPermission } from "@appTypes/ClientPermission";
import { StartOnlineCollectionRequest } from "@entities/StartOnlineCollectionRequest";
import { ConflictError } from "@errors/conflict";
import { FeeNotFoundError } from "@errors/feeNotFound";
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
import { type ActiveFee, getActiveFee } from "@/config/fees";
import { isUniqueViolation } from "../db/pgErrors";
import TransactionModel, {
  isStaleProcessingTransaction,
} from "../db/TransactionModel";
import { FailedTransactionError } from "../errors/failedTransaction";
import { emitInitPaymentConflictMetric } from "../health/initPaymentConcurrencyMetric";
import { emitPayGovErrorMetric } from "../health/payGovHealthMetric";
import { MAX_TOKEN_AGE_MS } from "@/config/constants";

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
    fee: feeKey,
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
      fee: feeKey,
    },
  );

  let fee: ActiveFee;
  try {
    fee = getActiveFee(feeKey);
  } catch (error) {
    if (error instanceof FeeNotFoundError) {
      throw new InvalidRequestError(`Unknown fee: ${feeKey}`);
    }
    throw error;
  }

  if (amount !== undefined && !fee.isVariable) {
    throw new InvalidRequestError(
      `Fee ${feeKey} does not allow variable amounts`,
    );
  }

  if (amount === undefined && fee.isVariable) {
    throw new InvalidRequestError(`Fee ${feeKey} requires an amount`);
  }

  const rejectIfAlreadyPaid = async (): Promise<void> => {
    const alreadyPaid =
      await TransactionModel.findPendingOrProcessedByReferenceId(
        clientName,
        transactionReferenceId,
      );

    if (!alreadyPaid) {
      return;
    }

    appContext.logger.info("Rejecting initPayment: transaction already paid", {
      transactionReferenceId,
      agencyTrackingId: alreadyPaid.agencyTrackingId,
      clientName,
      transactionStatus: alreadyPaid.transactionStatus,
      paymentStatus: alreadyPaid.paymentStatus,
    });
    emitInitPaymentConflictMetric("already_paid");
    throw new ConflictError(
      alreadyPaid.transactionStatus === "pending"
        ? ConflictError.PAYMENT_SETTLING_MESSAGE
        : ConflictError.ALREADY_PAID_MESSAGE,
    );
  };

  await rejectIfAlreadyPaid();

  const existingInFlightTransaction =
    await TransactionModel.findInFlightByReferenceId(
      clientName,
      transactionReferenceId,
    );

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
      try {
        await TransactionModel.updateToFailed(
          existingInFlightTransaction.agencyTrackingId,
          EXISTING_TOKEN_ERROR_CODE,
          "Existing token expired",
        );
      } catch (err) {
        if (!(err instanceof ConflictError)) {
          throw err;
        }
        // The row changed underneath us — most likely processPayment just landed a
        // successful completion on what looked like a stale row. Don't trust our
        // stale read; re-check instead of falling through to a new attempt.
        appContext.logger.info(
          "Stale in-flight transaction changed state before it could be superseded",
          {
            transactionReferenceId,
            agencyTrackingId: existingInFlightTransaction.agencyTrackingId,
          },
        );
        emitInitPaymentConflictMetric("stale_supersede_race");
        await rejectIfAlreadyPaid();
      }
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
    fee: feeKey,
    clientName,
  });

  let result: Awaited<ReturnType<typeof req.makeSoapRequest>>;
  try {
    await TransactionModel.createReceived({
      agencyTrackingId,
      fee: feeKey,
      clientName,
      transactionReferenceId,
      transactionAmount,
      metadata: request.metadata,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Lost the createReceived race against the partial unique index. The winner is either a
      // concurrent initPayment (in-flight) or a processPayment that just landed on paid — re-read
      // to tell them apart, so an overpayment attempt isn't reported as a transient race.
      await rejectIfAlreadyPaid();

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
      `Failed to record received transaction: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  appContext.logger.info("Transaction received and recorded", {
    transactionReferenceId,
    agencyTrackingId,
    transactionAmount,
    fee: feeKey,
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
    if (!(err instanceof ZodError || err instanceof FailedTransactionError)) {
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
