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
  const { feeId, amount, transactionReferenceId, urlSuccess, urlCancel } =
    request;
  const { clientName } = client;

  const fee = await FeesModel.getFeeById(feeId);
  if (!fee || !fee.tcsAppId) {
    throw new InvalidRequestError(`Unknown feeId: ${feeId}`);
  }

  if (amount !== undefined && !fee.isVariable) {
    throw new InvalidRequestError(
      `Fee ${feeId} does not allow variable amounts`,
    );
  }

  if (amount === undefined && fee.isVariable) {
    throw new InvalidRequestError(`Fee ${feeId} requires an amount`);
  }

  const existingInFlightTransaction =
    await TransactionModel.findInFlightByReferenceId(
      transactionReferenceId,
    );

  if (existingInFlightTransaction) {
    // TODO: PAY-298, is the token less than 3 hours old? If so, just return it.
    // If not, call Pay.gov and get a new token.
    // We might be able to reuse agencyTracking Id and just get a new token.
    throw new ConflictError(
      "A payment session is already in-flight for this transactionReferenceId",
    );
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

  let result: Awaited<ReturnType<typeof req.makeSoapRequest>>;
  try {
    await TransactionModel.createReceived({
      agencyTrackingId,
      feeId,
      transactionAmount,
      clientName,
      transactionReferenceId,
      metadata: request.metadata,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Concurrent initPayment lost the createReceived race — the partial unique index
      // `idx_transactions_unique_active` ensures at most one in-flight attempt per
      // (clientName, transactionReferenceId). Report the same 409 as the app-level check.
      throw new ConflictError(
        "A payment session is already in-flight for this transactionReferenceId",
      );
    }
    throw new Error(
      `Failed to record received transaction: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  try {
    result = await req.makeSoapRequest(appContext);
  } catch (err) {
    await TransactionModel.updateToFailed(agencyTrackingId).catch((dbErr) =>
      console.error("Failed to mark transaction as failed", dbErr),
    );
    console.error("Error making SOAP request to Pay.gov", err);
    throw new PayGovError("There was an error communicating with Pay.gov. Please retry your transaction.");
  }

  try {
    await TransactionModel.updateToInitiated(agencyTrackingId, result.token);
  } catch (err) {
    await TransactionModel.updateToFailed(agencyTrackingId).catch((dbErr) =>
      console.error("Failed to mark transaction as failed", dbErr),
    );
    console.error("Failed to mark transaction as initiated", err);
    throw new ServerError("Failed to record payment session. Please retry your transaction.");
  }

  return {
    token: result.token,
    paymentRedirect: `${process.env.PAYMENT_URL}?token=${result.token}&tcsAppID=${fee.tcsAppId}`,
  };
};
