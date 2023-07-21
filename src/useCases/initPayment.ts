import { AppContext } from "../types/AppContext";
import {
  StartOnlineCollectionRequest,
  startOnlineCollectionSchema,
} from "../entities/StartOnlineCollectionRequest";
import { InitPaymentRequest } from "../types/InitPaymentRequest";
import { InitPaymentResponse } from "../types/InitPaymentResponse";

export async function initPayment(
  appContext: AppContext,
  request: InitPaymentRequest
): Promise<InitPaymentResponse> {
  const rawRequest = {
    tcsAppId: request.appId,
    transactionAmount: request.amount,
    urlCancel: request.urlCancel,
    urlSuccess: request.urlSuccess,
    agencyTrackingId: request.trackingId,
  };

  await startOnlineCollectionSchema.validateAsync(rawRequest);

  console.log("request is valid", rawRequest);

  const req = new StartOnlineCollectionRequest(rawRequest);

  const result = await req.makeSoapRequest(appContext);

  // console.log("result from soap request", result);

  return {
    token: result.token,
    paymentRedirect: `${process.env.PAYMENT_URL}?token=${result.token}&tcsAppID=${request.appId}`,
  };
}
