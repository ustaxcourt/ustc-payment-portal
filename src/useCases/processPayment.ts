import { AppContext } from "../types/AppContext";
import { CompleteOnlineCollectionWithDetailsRequest } from "../entities/CompleteOnlineCollectionWithDetailsRequest";
import { ProcessPaymentRequest } from "../types/ProcessPaymentRequest";
import { ProcessPaymentResponse } from "../types/ProcessPaymentResponse";
import { FailedTransactionError } from "../errors/failedTransaction";
import { parseTransactionStatus } from "./parseTransactionStatus";
import { ClientPermission } from "../types/ClientPermission";

export type ProcessPayment = (
  appContext: AppContext,
  params: {
    client: ClientPermission;
    request: ProcessPaymentRequest;
  },
) => Promise<ProcessPaymentResponse>;

export const processPayment: ProcessPayment = async (
  appContext: AppContext,
  { client: _client, request },
) => {
  void _client;
  const req = new CompleteOnlineCollectionWithDetailsRequest({
    tcsAppId: "", // Required by Pay.gov SOAP schema — token alone identifies the transaction on this call
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
