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
import { logError } from "@utils/logError";
import { safeUpdateToFailed } from "@utils/safeUpdateToFailed";
import { ZodError } from "zod";
import { MAX_TOKEN_AGE_MS } from "@/config/constants";
import { type ActiveFee, getActiveFee } from "@/config/fees";
import { getReturnCode } from "@/config/payGovReturnCodes";
import { authorizeClient } from "../authorizeClient";
import { isUniqueViolation } from "../db/pgErrors";
import TransactionModel, {
  isStaleProcessingTransaction,
} from "../db/TransactionModel";
import { FailedTransactionError } from "../errors/failedTransaction";
import { emitInitPaymentConflictMetric } from "../health/initPaymentConcurrencyMetric";
import { emitPayGovErrorMetric } from "../health/payGovHealthMetric";

type ReceivedTransactionParams = {
  agencyTrackingId: string;
  fee: string;
  clientName: string;
  transactionReferenceId: string;
  transactionAmount: number;
  metadata: InitPaymentRequest["metadata"];
};

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
  const clientLogFields = { transactionReferenceId, clientName, fee: feeKey };

  appContext.logger.debug("Received initPayment request", {
    ...clientLogFields,
    hasAmount: amount !== undefined,
    metadata: request.metadata,
  });

  authorizeClient(client, feeKey);

  /* istanbul ignore next */
  appContext.logger.info("Authorized client for initPayment", clientLogFields);

  const hasAmount = amount !== undefined;
  const fee = resolveFeeForRequest(feeKey, hasAmount);

  const shortCircuitResponse = await handleIfPaymentProcessedOrPending(
    appContext,
    clientName,
    transactionReferenceId,
    fee,
  );

  if (shortCircuitResponse) {
    return shortCircuitResponse;
  }

  // TODO: Add a unit test for a variable fee request (when we actually have one to support)
  /* istanbul ignore next */
  const transactionAmount = fee.isVariable ? amount! : fee.amount!;
  const agencyTrackingId = generateAgencyTrackingId();
  const baseLogFields = { transactionReferenceId, agencyTrackingId };

  const req = new StartOnlineCollectionRequest({
    tcsAppId: fee.tcsAppId,
    agencyTrackingId,
    transactionAmount,
    urlSuccess,
    urlCancel,
  });

  appContext.logger.info("Initiating new transaction", {
    ...baseLogFields,
    transactionAmount,
    fee: feeKey,
    clientName,
  });

  await recordReceivedTransaction(
    appContext,
    {
      agencyTrackingId,
      fee: feeKey,
      clientName,
      transactionReferenceId,
      transactionAmount,
      metadata: request.metadata,
    },
    baseLogFields,
  );

  appContext.logger.info("Transaction received and recorded", {
    ...baseLogFields,
    transactionAmount,
    fee: feeKey,
    clientName,
    metadata: request.metadata,
  });

  let result: Awaited<ReturnType<typeof req.makeSoapRequest>>;
  try {
    result = await req.makeSoapRequest(appContext);
  } catch (err) {
    logError(
      appContext,
      "Error making SOAP request to Pay.gov",
      err,
      baseLogFields,
    );
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
    logError(
      appContext,
      "Failed to mark transaction as initiated",
      err,
      baseLogFields,
    );
    await safeUpdateToFailed(appContext, agencyTrackingId);
    throw new ServerError(
      "Failed to record payment session. Please retry your transaction.",
    );
  }

  appContext.logger.info("Successfully initiated transaction", {
    ...baseLogFields,
    token: result.token,
  });

  return {
    token: result.token,
    paymentRedirect: `${process.env.PAYMENT_URL}?token=${result.token}&tcsAppID=${fee.tcsAppId}`,
  };
};

const resolveFeeForRequest = (
  feeKey: string,
  hasAmount: boolean,
): ActiveFee => {
  let fee: ActiveFee;

  try {
    fee = getActiveFee(feeKey);
  } catch (error) {
    if (error instanceof FeeNotFoundError) {
      throw new InvalidRequestError(`Unknown fee: ${feeKey}`);
    }
    throw error;
  }

  if (hasAmount !== fee.isVariable) {
    throw new InvalidRequestError(
      hasAmount
        ? `Fee ${feeKey} does not allow variable amounts`
        : `Fee ${feeKey} requires an amount`,
    );
  }

  return fee;
};

const rejectAlreadyPaidTransaction = (
  appContext: AppContext,
  clientName: string,
  transactionReferenceId: string,
  alreadyPaid: TransactionModel,
): never => {
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

const rejectIfAlreadyPaid = async (
  clientName: string,
  transactionReferenceId: string,
  appContext: AppContext,
): Promise<void> => {
  const alreadyPaid =
    await TransactionModel.findPendingOrProcessedByReferenceId(
      clientName,
      transactionReferenceId,
    );

  if (!alreadyPaid) return;

  rejectAlreadyPaidTransaction(
    appContext,
    clientName,
    transactionReferenceId,
    alreadyPaid,
  );
};

const recordReceivedTransaction = async (
  appContext: AppContext,
  createReceivedParams: ReceivedTransactionParams,
  baseLogFields: { transactionReferenceId: string; agencyTrackingId: string },
): Promise<void> => {
  const { clientName, transactionReferenceId } = createReceivedParams;

  try {
    await TransactionModel.createReceived(createReceivedParams);
  } catch (err) {
    if (isUniqueViolation(err)) {
      await rejectIfAlreadyPaid(clientName, transactionReferenceId, appContext);

      const EXISTING_IN_FLIGHT_TRANSACTION_ERROR =
        "A payment session is already in-flight for this transactionReferenceId";
      logError(
        appContext,
        EXISTING_IN_FLIGHT_TRANSACTION_ERROR,
        err,
        baseLogFields,
      );
      emitInitPaymentConflictMetric("persist_race");
      throw new ConflictError(EXISTING_IN_FLIGHT_TRANSACTION_ERROR);
    }

    logError(
      appContext,
      "Failed to record received transaction",
      err,
      baseLogFields,
    );

    /* istanbul ignore next */
    throw new Error(
      `Failed to record received transaction: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
};

const resolveInFlightTransaction = async (
  appContext: AppContext,
  transactionReferenceId: string,
  existingTransaction: TransactionModel,
  fee: ActiveFee,
): Promise<InitPaymentResponse | null> => {
  const tokenAgeMs =
    Date.now() - new Date(existingTransaction.lastUpdatedAt).getTime();
  const staleProcessing = isStaleProcessingTransaction(existingTransaction);
  const inFlightLogFields = {
    transactionReferenceId,
    agencyTrackingId: existingTransaction.agencyTrackingId,
    tokenAgeMs,
  };

  if (
    existingTransaction.transactionStatus === "processing" &&
    !staleProcessing
  ) {
    appContext.logger.info(
      "Rejecting initPayment: transaction is actively processing",
      inFlightLogFields,
    );
    emitInitPaymentConflictMetric("processing_in_flight");
    throw new ConflictError(
      ConflictError.PAYMENT_IN_FLIGHT_TRANSACTION_MESSAGE,
    );
  }

  if (
    existingTransaction.paygovToken &&
    tokenAgeMs < MAX_TOKEN_AGE_MS &&
    !staleProcessing
  ) {
    appContext.logger.info("Returning existing in-flight transaction", {
      ...inFlightLogFields,
      transactionStatus: existingTransaction.transactionStatus,
    });
    return {
      token: existingTransaction.paygovToken,
      paymentRedirect: `${process.env.PAYMENT_URL}?token=${existingTransaction.paygovToken}&tcsAppID=${fee.tcsAppId}`,
    };
  }

  appContext.logger.info("Existing in-flight transaction token expired", {
    ...inFlightLogFields,
    transactionStatus: existingTransaction.transactionStatus,
    staleProcessing,
  });
  await TransactionModel.updateToFailed(
    existingTransaction.agencyTrackingId,
    5009,
    getReturnCode(5009)?.returnDetail,
  );
  return null;
};

const handleIfPaymentProcessedOrPending = async (
  appContext: AppContext,
  clientName: string,
  transactionReferenceId: string,
  fee: ActiveFee,
): Promise<InitPaymentResponse | null> => {
  const existingTransaction =
    await TransactionModel.findByReferenceIdAndTransactionStatus(
      clientName,
      transactionReferenceId,
      ["initiated", "processing", "pending", "processed"],
    );

  if (!existingTransaction) {
    return null;
  }

  switch (existingTransaction.transactionStatus) {
    case "initiated":
    case "processing":
      return resolveInFlightTransaction(
        appContext,
        transactionReferenceId,
        existingTransaction,
        fee,
      );

    case "pending":
    case "processed":
      return rejectAlreadyPaidTransaction(
        appContext,
        clientName,
        transactionReferenceId,
        existingTransaction,
      );

    default:
      return null;
  }
};
