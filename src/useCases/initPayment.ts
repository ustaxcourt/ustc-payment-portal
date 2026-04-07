import { AppContext } from "../types/AppContext";
import {
  InitPaymentInternalRequest,
  InitPaymentResponse,
} from "../schemas/InitPayment.schema";
import { getFeeConfig } from "../fees";
import { InvalidRequestError } from "../errors/invalidRequest";
import { PayGovError } from "../errors/payGovError";
import { ServerError } from "../errors/serverError";
import { randomUUID } from "crypto";
import TransactionModel from "../db/TransactionModel";
import { StartOnlineCollectionRequest } from "../entities/StartOnlineCollectionRequest";

export type InitPayment = (
  appContext: AppContext,
  request: InitPaymentInternalRequest,
) => Promise<InitPaymentResponse>;

export const initPayment: InitPayment = async (appContext, request) => {
  const { feeId, amount, transactionReferenceId, urlSuccess, urlCancel, clientName } = request;

  const feeConfig = await getFeeConfig(feeId);
  if (!feeConfig) {
    throw new InvalidRequestError(`Unknown feeId: ${feeId}`);
  }

  if (amount !== undefined && !feeConfig.isVariable) {
    throw new InvalidRequestError(`Fee ${feeId} does not allow variable amounts`);
  }

  if (amount === undefined && feeConfig.isVariable) {
    throw new InvalidRequestError(`Fee ${feeId} requires an amount`);
  }

  const transactionAmount = feeConfig.isVariable ? amount! : feeConfig.amount;
  const agencyTrackingId = randomUUID().replace(/-/g, '').slice(0, 21);

  const req = new StartOnlineCollectionRequest({
    tcsAppId: feeConfig.tcsAppId,
    agencyTrackingId,
    transactionAmount,
    urlSuccess,
    urlCancel,
  });

  let recordCreated = false;
  try {
    await TransactionModel.createReceived({
      agencyTrackingId,
      feeId,
      feeName: feeConfig.feeName,
      feeAmount: feeConfig.amount,
      clientName,
      transactionReferenceId,
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      metadata: request.metadata,
    });
    recordCreated = true;

    let result;
    try {
      result = await req.makeSoapRequest(appContext);
    } catch (soapErr) {
      throw new PayGovError(
        `Failed to communicate with Pay.gov: ${soapErr instanceof Error ? soapErr.message : String(soapErr)}`
      );
    }

    await TransactionModel.updateToInitiated(agencyTrackingId, result.token);

    return {
      token: result.token,
      paymentRedirect: `${process.env.PAYMENT_URL}?token=${result.token}&tcsAppID=${feeConfig.tcsAppId}`,
    };
  } catch (err) {
    if (recordCreated) {
      await TransactionModel.updateToFailed(agencyTrackingId);
    }

    if (err instanceof PayGovError) {
      throw err;
    }
    throw new ServerError(
      `Failed to initiate payment: ${err instanceof Error ? err.message : String(err)}`
    );
  }
};
