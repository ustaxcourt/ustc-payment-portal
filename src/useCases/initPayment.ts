import { AppContext } from "../types/AppContext";
import {
  InitPaymentRequest,
  InitPaymentResponse,
} from "../schemas/InitPayment.schema";
import { InvalidRequestError } from "../errors/invalidRequest";
import FeesModel from "../db/FeesModel";
import { generateAgencyTrackingId } from "../utils/generateTrackingId";
import TransactionModel from "../db/TransactionModel";
import { StartOnlineCollectionRequest } from "../entities/StartOnlineCollectionRequest";

type InitPaymentInternalRequest = InitPaymentRequest & { clientName: string };

export type InitPayment = (
  appContext: AppContext,
  request: InitPaymentInternalRequest,
) => Promise<InitPaymentResponse>;

export const initPayment: InitPayment = async (appContext, request) => {
  const { feeId, amount, transactionReferenceId, urlSuccess, urlCancel, clientName } = request;

  const fee = await FeesModel.getFeeById(feeId);
  if (!fee || !fee.tcsAppId) {
    throw new InvalidRequestError(`Unknown feeId: ${feeId}`);
  }

  if (amount !== undefined && !fee.isVariable) {
    throw new InvalidRequestError(`Fee ${feeId} does not allow variable amounts`);
  }

  if (amount === undefined && fee.isVariable) {
    throw new InvalidRequestError(`Fee ${feeId} requires an amount`);
  }

  const transactionAmount = fee.isVariable ? amount! : fee.amount!;
  const agencyTrackingId = generateAgencyTrackingId();

  const req = new StartOnlineCollectionRequest({
    tcsAppId: fee.tcsAppId,
    agencyTrackingId,
    transactionAmount,
    urlSuccess,
    urlCancel,
  });

  let result;
  try {
    await TransactionModel.createReceived({
      agencyTrackingId,
      feeId,
      clientName,
      transactionReferenceId,
      paymentStatus: 'pending',
      transactionStatus: 'received',
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      metadata: request.metadata,
    });

    result = await req.makeSoapRequest(appContext);

    await TransactionModel.updateToInitiated(agencyTrackingId, result.token);
  } catch (err) {
    await TransactionModel.updateToFailed(agencyTrackingId);
    throw new Error(`Failed to initiate payment: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    token: result.token,
    paymentRedirect: `${process.env.PAYMENT_URL}?token=${result.token}&tcsAppID=${fee.tcsAppId}`,
  };
};
