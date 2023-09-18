import { AppContext } from "../types/AppContext";
import { CompleteOnlineCollectionWithDetailsRequest } from "../entities/CompleteOnlineCollectionWithDetailsRequest";
import { ProcessPaymentRequest } from "../types/ProcessPaymentRequest";
import { ProcessPaymentResponse } from "../types/ProcessPaymentResponse";

export type ProcessPayment = (
  appContext: AppContext,
  request: ProcessPaymentRequest
) => Promise<ProcessPaymentResponse>;

export const processPayment: ProcessPayment = async (
  appContext: AppContext,
  request: ProcessPaymentRequest
) => {
  const req = new CompleteOnlineCollectionWithDetailsRequest({
    tcsAppId: request.appId,
    token: request.token,
  });
  console.log("processPayment request", req);

  const result = await req.makeSoapRequest(appContext);

  console.log("processPayment result", result);

  return {
    trackingId: result.paygov_tracking_id,
    transactionStatus: result.transaction_status,
  };
};
