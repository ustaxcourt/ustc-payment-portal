import { AppContext } from "../types/AppContext";
import {
  StartOnlineCollectionRequest,
  startOnlineCollectionSchema,
} from "../entities/StartOnlineCollectionRequest";
import { InvalidRequestError } from "../errors/invalidRequest";
import { InitPaymentRequest } from "../types/InitPaymentRequest";
import { InitPaymentResponse } from "../types/InitPaymentResponse";
import FeesModel from "../db/FeesModel";
import { generateAgencyTrackingId } from "../utils/generateTrackingId";

export type InitPayment = (
  appContext: AppContext,
  request: InitPaymentRequest
) => Promise<InitPaymentResponse>;

export const initPayment: InitPayment = async (appContext, request) => {
  const fee = await FeesModel.getFeeById(request.feeId);
  if (!fee || !fee.tcsAppId || !fee.amount) {
    throw new InvalidRequestError(`Unknown feeId: ${request.feeId}`);
  }

  const rawRequest = {
    tcsAppId: fee.tcsAppId,
    feeId: request.feeId,
    urlSuccess: request.urlSuccess,
    urlCancel: request.urlCancel,
    agencyTrackingId: generateAgencyTrackingId(),
    clientName: request.clientName,
    metadata: request.metadata,
    transactionAmount: fee.amount,
  };

  startOnlineCollectionSchema.parse(rawRequest);

  console.log("initPayment request:", rawRequest);

  const req = new StartOnlineCollectionRequest(rawRequest);

  const result = await req.makeSoapRequest(appContext);

  console.log(`initPayment result:`, result);

  return {
    token: result.token,
    paymentRedirect: `${process.env.PAYMENT_URL}?token=${result.token}&tcsAppID=${fee.tcsAppId}`,
  };
};
