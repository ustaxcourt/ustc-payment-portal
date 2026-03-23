import { AppContext } from "../types/AppContext";
import {
  StartOnlineCollectionRequest,
  startOnlineCollectionSchema,
} from "../entities/StartOnlineCollectionRequest";
import { InvalidRequestError } from "../errors/invalidRequest";
import { InitPaymentRequest } from "../types/InitPaymentRequest";
import { InitPaymentResponse } from "../types/InitPaymentResponse";

// TODO: replace with DB lookup once fees table is provisioned.
// To add a new fee type in the meantime: add an entry here and redeploy.
// The tcs_app_id value is provided by Pay.gov during onboarding. See docs/client-onboarding.md.
const feeToTcsAppId: Record<string, string> = {
  PETITION_FILING_FEE: "TCSUSTAXCOURTPETITION",
  NONATTORNEY_EXAM_REGISTRATION_FEE: "TCSUSTAXCOURTANAEF",
};

export type InitPayment = (
  appContext: AppContext,
  request: InitPaymentRequest
) => Promise<InitPaymentResponse>;

export const initPayment: InitPayment = async (appContext, request) => {
  const tcsAppId = feeToTcsAppId[request.feeId];

  if (!tcsAppId) {
    throw new InvalidRequestError(`Unknown feeId: ${request.feeId}`);
  }

  const rawRequest = {
    tcsAppId,
    transactionAmount: request.amount,
    urlCancel: request.urlCancel,
    urlSuccess: request.urlSuccess,
    agencyTrackingId: request.trackingId,
  };

  startOnlineCollectionSchema.parse(rawRequest);

  console.log("initPayment request:", rawRequest);

  const req = new StartOnlineCollectionRequest(rawRequest);

  const result = await req.makeSoapRequest(appContext);

  console.log(`initPayment result:`, result);

  return {
    token: result.token,
    paymentRedirect: `${process.env.PAYMENT_URL}?token=${result.token}&tcsAppID=${tcsAppId}`,
  };
};
