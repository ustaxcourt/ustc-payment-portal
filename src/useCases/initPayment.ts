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
import TransactionModel from "../db/TransactionModel";

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

  let result;
  try {
    const newTransaction = await TransactionModel.createReceived({
      agencyTrackingId: rawRequest.agencyTrackingId,
      feeId: rawRequest.feeId,
      clientName: rawRequest.clientName,
      transactionReferenceId: rawRequest.agencyTrackingId,
      paymentStatus: 'pending',
      transactionStatus: 'received',
      paymentMethod: 'plastic_card', // TODO: Update with actual payment method
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      metadata: rawRequest.metadata,
    });

    result = await req.makeSoapRequest(appContext);
    console.log(`initPayment result:`, result);

    const updatedTransaction = await TransactionModel.updateToInitiated(rawRequest.agencyTrackingId, result.token);
    console.log("Updated transaction to initiated in DB:", updatedTransaction);
  } catch (err) {
    // If it fails, update transaction status to failed, use the error handler
    await TransactionModel.updateToFailed(rawRequest.agencyTrackingId);
    throw new Error(`Failed to initiate payment: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    token: result.token,
    paymentRedirect: `${process.env.PAYMENT_URL}?token=${result.token}&tcsAppID=${fee.tcsAppId}`,
  };
};
