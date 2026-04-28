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
import { StartOnlineCollectionRequest } from "../entities/StartOnlineCollectionRequest";
import { ClientPermission } from "../types/ClientPermission";

const NETWORK_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

const isNetworkError = (err: unknown): boolean =>
  err instanceof Error &&
  NETWORK_ERROR_CODES.has((err as NodeJS.ErrnoException).code ?? "");

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
      clientName,
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
      paymentStatus: "pending",
      transactionStatus: "received",
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
    await TransactionModel.updateToFailed(agencyTrackingId);
    if (isNetworkError(err)) {
      throw new PayGovError();
    }
    throw err;
  }

  try {
    await TransactionModel.updateToInitiated(agencyTrackingId, result.token);
  } catch (err) {
    throw new Error(
      `Payment was initiated but failed to persist initiated status: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  return {
    token: result.token,
    paymentRedirect: `${process.env.PAYMENT_URL}?token=${result.token}&tcsAppID=${fee.tcsAppId}`,
  };
};
