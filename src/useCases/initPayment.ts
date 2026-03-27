import { AppContext } from "../types/AppContext";
import {
  StartOnlineCollectionRequest,
  startOnlineCollectionSchema,
} from "../entities/StartOnlineCollectionRequest";
import { InvalidRequestError } from "../errors/invalidRequest";
import { InitPaymentRequest } from "../types/InitPaymentRequest";
import { InitPaymentResponse } from "../types/InitPaymentResponse";
import FeesModel from "../db/FeesModel";

export type InitPayment = (
  appContext: AppContext,
  request: InitPaymentRequest
) => Promise<InitPaymentResponse>;

export const initPayment: InitPayment = async (appContext, request) => {
  const fee = await FeesModel.getFeeById(request.feeId);
  const tcsAppId = fee?.tcsAppId || null;

  if (!tcsAppId) {
    throw new InvalidRequestError(`Unknown feeId: ${request.feeId}`);
  }

  const rawRequest = {
    tcsAppId,
    transactionAmount: request.amount,
    urlCancel: request.urlCancel,
    urlSuccess: request.urlSuccess,
    // Clarification needed: Should the tracking ID be generated here or passed in from the client? For now, we'll generate it here to ensure uniqueness and consistency.
    agencyTrackingId: request.trackingId,
  };

  startOnlineCollectionSchema.parse(rawRequest);

  console.log("initPayment request:", rawRequest);

  const req = new StartOnlineCollectionRequest(rawRequest);

  const result = await req.makeSoapRequest(appContext);

  console.log(`initPayment result:`, result);

  return {
    token: result.token,
    paymentRedirect: `${process.env.PAYMENT_URL}?token=${result.token}&tcsAppID=${tcsAppId}`,
  };
};
