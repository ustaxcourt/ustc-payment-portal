import { AppContext } from "../types/AppContext";
import { CompleteOnlineCollectionRequest } from "../entities/CompleteOnlineCollectionRequest";

export type ProcessPaymentRequest = {
  appId: string;
  token: string;
};

type ProcessPaymentResponse = {
  trackingId: string;
};

export async function processPayment(
  appContext: AppContext,
  request: ProcessPaymentRequest
): Promise<ProcessPaymentResponse> {

  const req = new CompleteOnlineCollectionRequest({
    tcs_app_id: request.appId,
    token: request.token,
  });

  const result = await req.makeSoapRequest(appContext);

  return {
    trackingId: result.pay_gov_tracking_id
  };
}