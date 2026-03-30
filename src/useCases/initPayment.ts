import { AppContext } from "../types/AppContext";
import {
  InitPaymentRequest,
  InitPaymentResponse,
} from "../schemas/InitPayment.schema";
import { getFeeConfig } from "../fees";
import { InvalidRequestError } from "../errors/invalidRequest";

export type InitPayment = (
  appContext: AppContext,
  request: InitPaymentRequest,
) => Promise<InitPaymentResponse>;

export const initPayment: InitPayment = async (_appContext, request) => {
  const { feeId, amount } = request;

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

  // TODO: implement Pay.gov token retrieval (response shape is a stub)
  return { token: "", paymentRedirect: "https://stub.invalid" };
};
