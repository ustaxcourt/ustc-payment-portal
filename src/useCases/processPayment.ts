import { AppContext } from "../types/AppContext";
import { CompleteOnlineCollectionRequest } from "../entities/CompleteOnlineCollectionRequest";
import { ProcessPaymentRequest } from "../types/ProcessPaymentRequest";
import { ProcessPaymentResponse } from "../types/ProcessPaymentResponse";

export async function processPayment(
  appContext: AppContext,
  request: ProcessPaymentRequest
): Promise<ProcessPaymentResponse> {
  const req = new CompleteOnlineCollectionRequest({
    tcsAppId: request.appId,
    token: request.token,
  });

  const result = await req.makeSoapRequest(appContext);

  console.log("result from soap request", result);

  return {
    trackingId: result.paygov_tracking_id,
  };
}
