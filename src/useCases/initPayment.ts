import { AppContext } from "../types/AppContext";

type InitPaymentRequest = {
  trackingId: string;
  urlSuccess: string;
  urlCancel: string;
};

export const initPayment = async (
  appContext: AppContext,
  request: InitPaymentRequest
) => {
  // this will make a soap request to pay.gov
  const req = {
    tcs_app_id: process.env.PAY_GOV_TCP_APP_ID,
    agency_tracking_id: request.trackingId,
    transaction_type: "Sale",
    transaction_amount: "25",
    language: "en",
    url_success: request.urlSuccess,
    url_cancel: request.urlCancel,
  };
};
