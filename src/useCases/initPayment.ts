import { AppContext } from "../types/AppContext";
import {
  InitPaymentRequest,
  InitPaymentResponse,
} from "../schemas/InitPayment.schema";
import { InvalidRequestError } from "../errors/invalidRequest";
import { ConflictError } from "../errors/conflict";
import FeesModel from "../db/FeesModel";
import { generateAgencyTrackingId } from "../utils/generateTrackingId";
import TransactionModel from "../db/TransactionModel";
import { isUniqueViolation } from "../db/pgErrors";
import { PayGovError } from "../errors/payGovError";
import { ServerError } from "../errors/serverError";
import { StartOnlineCollectionRequest } from "../entities/StartOnlineCollectionRequest";
import { ClientPermission } from "../types/ClientPermission";
import { safeUpdateToFailed } from "../utils/safeUpdateToFailed";
import { authorizeClient } from "../authorizeClient";

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
    feeKey,
    clientName,
    transactionReferenceId,
    hasAmount: amount !== undefined,
    metadataKeys: request.metadata ? Object.keys(request.metadata) : [],
  });

  authorizeClient(client, feeKey);
  appContext.logger.info("Authorized client for initPayment", {
    clientName,
    feeKey,
  });

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
    if (
      existingInFlightTransaction.paygovToken &&
      tokenAgeMs < MAX_TOKEN_AGE_MS
    ) {
      appContext.logger.info("Returning existing in-flight transaction", {
        agencyTrackingId: existingInFlightTransaction.agencyTrackingId,
        tokenAgeMs,
      });
      return {
        token: existingInFlightTransaction.paygovToken,
        paymentRedirect: `${process.env.PAYMENT_URL}?token=${existingInFlightTransaction.paygovToken}&tcsAppID=${fee.tcsAppId}`,
      };
    } else {
      appContext.logger.info("Existing in-flight transaction token expired", {
        agencyTrackingId: existingInFlightTransaction.agencyTrackingId,
        tokenAgeMs,
      });
      await TransactionModel.updateToFailed(
        existingInFlightTransaction.agencyTrackingId,
        EXISTING_TOKEN_ERROR_CODE,
        "Existing token expired",
      );
    }
  }

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
    agencyTrackingId,
    transactionReferenceId,
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
        agencyTrackingId,
        clientName,
        transactionReferenceId,
      });
      throw new ConflictError(EXISTING_IN_FLIGHT_TRANSACTION_ERROR);
    }

    appContext.logger.error("Failed to record received transaction", {
      agencyTrackingId,
      errorName: err instanceof Error ? err.name : undefined,
      errorMessage: err instanceof Error ? err.message : String(err),
    });

    throw new Error(
      `Failed to record received transaction: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  appContext.logger.info("Transaction received and recorded", {
    agencyTrackingId,
    transactionAmount,
    feeId: fee.feeId,
    clientName,
    transactionReferenceId,
    ...(request.metadata
      ? Object.fromEntries(
          Object.entries(request.metadata).map(([k, v]) => [
            `metadata_${k}`,
            v,
          ]),
        )
      : {}),
  });

  try {
    result = await req.makeSoapRequest(appContext);
  } catch (err) {
    appContext.logger.error("Error making SOAP request to Pay.gov", {
      agencyTrackingId,
      clientName,
      errorName: err instanceof Error ? err.name : undefined,
      errorMessage: err instanceof Error ? err.message : String(err),
    });

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
    appContext.logger.error("Failed to mark transaction as initiated", {
      errorName: err instanceof Error ? err.name : undefined,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    await safeUpdateToFailed(appContext, agencyTrackingId);
    throw new ServerError(
      "Failed to record payment session. Please retry your transaction.",
    );
  }

  appContext.logger.info("Successfully initiated transaction", {
    agencyTrackingId,
    token: result.token,
  });

  return {
    token: result.token,
    paymentRedirect: `${process.env.PAYMENT_URL}?token=${result.token}&tcsAppID=${fee.tcsAppId}`,
  };
};
