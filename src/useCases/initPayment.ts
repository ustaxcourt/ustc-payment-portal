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

const PG_UNIQUE_VIOLATION = "23505";

const isUniqueViolation = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  const nativeCode = (err as { nativeError?: { code?: unknown } }).nativeError
    ?.code;
  return code === PG_UNIQUE_VIOLATION || nativeCode === PG_UNIQUE_VIOLATION;
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

  const existingInitiatedTransaction =
    await TransactionModel.findInitiatedByReferenceId(
      clientName,
      transactionReferenceId,
    );

  if (existingInitiatedTransaction) {
    throw new ConflictError(
      "A payment session is already initiated for this transactionReferenceId",
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
        "A payment session is already initiated for this transactionReferenceId",
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
