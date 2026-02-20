import { AppContext } from "../types/AppContext";
import { CompleteOnlineCollectionWithDetailsRequest } from "../entities/CompleteOnlineCollectionWithDetailsRequest";
import { ProcessPaymentRequest } from "../types/ProcessPaymentRequest";
import { ProcessPaymentResponse } from "../types/ProcessPaymentResponse";
import { FailedTransactionError } from "../errors/failedTransaction";
import { parseTransactionStatus } from "./parseTransactionStatus";

export type ProcessPayment = (
  appContext: AppContext,
  request: ProcessPaymentRequest
) => Promise<ProcessPaymentResponse>;

export const processPayment: ProcessPayment = async (
  appContext: AppContext,
  request: ProcessPaymentRequest,
) => {
  const req = new CompleteOnlineCollectionWithDetailsRequest({
    tcsAppId: request.appId,
    token: request.token,
  });
  console.log("processPayment request", req);

  try {
    const result = await req.makeSoapRequest(appContext);

    console.log("processPayment result", result);

    return {
      trackingId: result.paygov_tracking_id,
      transactionStatus: parseTransactionStatus(result.transaction_status),
    };
  } catch (err) {
    if (err instanceof FailedTransactionError) {
      return {
        transactionStatus: "Failed",
        message: err.message,
        code: err.code,
      };
    } else throw err;
  }
};
