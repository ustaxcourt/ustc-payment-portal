import { AppContext } from "../types/AppContext";
import {
  StartOnlineCollectionRequest,
  startOnlineCollectionSchema,
} from "../entities/StartOnlineCollectionRequest";
import { InitPaymentRequest } from "../types/InitPaymentRequest";
import { InitPaymentResponse } from "../types/InitPaymentResponse";

export type InitPayment = (
  appContext: AppContext,
  request: InitPaymentRequest
) => Promise<InitPaymentResponse>;

export const initPayment: InitPayment = async (appContext, request) => {
  const rawRequest = {
    tcsAppId: request.appId,
    transactionAmount: request.amount,
    urlCancel: request.urlCancel,
    urlSuccess: request.urlSuccess,
    agencyTrackingId: request.trackingId,
  };

  await startOnlineCollectionSchema.validateAsync(rawRequest);

  console.log("initPayment request:", rawRequest);

  const req = new StartOnlineCollectionRequest(rawRequest);

  const result = await req.makeSoapRequest(appContext);

  console.log(`initPayment result:`, result);

  return {
    token: result.token,
    paymentRedirect: `${process.env.PAYMENT_URL}?token=${result.token}&tcsAppID=${request.appId}`,
  };
};
