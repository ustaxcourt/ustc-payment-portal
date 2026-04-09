import { AppContext } from "../types/AppContext";
import {
  InitPaymentRequest,
  InitPaymentResponse,
} from "../schemas/InitPayment.schema";
import { getFeeConfig } from "../fees";
import { InvalidRequestError } from "../errors/invalidRequest";
import { PayGovError } from "../errors/payGovError";
import { StartOnlineCollectionRequest } from "../entities/StartOnlineCollectionRequest";

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
  request: InitPaymentRequest,
) => Promise<InitPaymentResponse>;

export const initPayment: InitPayment = async (appContext, request) => {
  const { feeId, amount, transactionReferenceId, urlSuccess, urlCancel } =
    request;

  const feeConfig = await getFeeConfig(feeId);

  if (!feeConfig) {
    throw new InvalidRequestError(`Unknown feeId: ${feeId}`);
  }

  if (amount !== undefined && !feeConfig.isVariable) {
    throw new InvalidRequestError(
      `Fee ${feeId} does not allow variable amounts`,
    );
  }

  if (amount === undefined && feeConfig.isVariable) {
    throw new InvalidRequestError(`Fee ${feeId} requires an amount`);
  }

  const transactionAmount = feeConfig.isVariable ? amount! : feeConfig.amount;

  const req = new StartOnlineCollectionRequest({
    tcsAppId: feeConfig.tcsAppId,
    agencyTrackingId: transactionReferenceId,
    transactionAmount,
    urlSuccess,
    urlCancel,
  });

  try {
    const result = await req.makeSoapRequest(appContext);
    return {
      token: result.token,
      paymentRedirect: `${process.env.PAYMENT_URL}?token=${result.token}&tcsAppID=${feeConfig.tcsAppId}`,
    };
  } catch (err) {
    if (isNetworkError(err)) {
      throw new PayGovError();
    }
    throw err;
  }
};
