import { AppContext } from "../types/AppContext";

import { StartOnlineCollectionRequest } from '../entities/StartOnlineCollectionRequest'
import { InitPaymentRequest } from "../types/InitPaymentRequest";
import { InitPaymentResponse } from "../types/InitPaymentResponse";

export async function initPayment(
  appContext: AppContext,
  request: InitPaymentRequest
): Promise<InitPaymentResponse> {

  console.log(request);

  const req = new StartOnlineCollectionRequest({
    tcs_app_id: request.appId,
    transaction_amount: request.amount,
    url_cancel: request.urlCancel,
    url_success: request.urlSuccess,
    agency_tracking_id: request.trackingId,
  });

  const result = await req.makeSoapRequest(appContext);

  return {
    token: result.token,
    paymentRedirect: `${process.env.PAYMENT_URL}?token=${result.token}&tcsAppID=${request.appId}`,
  };
}
