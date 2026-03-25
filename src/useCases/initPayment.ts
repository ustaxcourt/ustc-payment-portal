import { AppContext } from "../types/AppContext";
import { InitPaymentRequestSchema, InitPaymentResponse } from "../schemas/InitPayment.schema";
import { getFeeConfig } from "../fees";
import { InvalidRequestError } from "../errors/invalidRequest";

export type InitPayment = (
  appContext: AppContext,
  request: Record<string, unknown>
) => Promise<InitPaymentResponse>;

export const initPayment: InitPayment = async (_appContext, request) => {
  const parsed = InitPaymentRequestSchema.safeParse(request);

  if (!parsed.success) {
    throw new InvalidRequestError(
      parsed.error.issues.map((i) => i.message).join(", ")
    );
  }

  const { feeId, amount } = parsed.data;

  const feeConfig = await getFeeConfig(feeId);

  if (!feeConfig) {
    throw new InvalidRequestError(`Unknown feeId: ${feeId}`);
  }

  if (amount !== undefined && !feeConfig.isVariable) {
    throw new InvalidRequestError(
      `Fee ${feeId} does not allow variable amounts`
    );
  }

  if (amount === undefined && feeConfig.isVariable) {
    throw new InvalidRequestError(
      `Fee ${feeId} requires an amount`
    );
  }

  // TODO: implement Pay.gov token retrieval (response shape is a stub)
  return { token: "", paymentRedirect: "" };
};
