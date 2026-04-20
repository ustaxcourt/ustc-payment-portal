import { ClientPermission } from "../types/ClientPermission";
import { GetRequestRequest } from "../entities/GetDetailsRequest";
import { AppContext } from "../types/AppContext";
import { TransactionStatus } from "../types/TransactionStatus";
import { parseTransactionStatus } from "./parseTransactionStatus";
import TransactionModel from "../db/TransactionModel";
import FeesModel from "../db/FeesModel";
import { NotFoundError } from "../errors/notFound";

export type GetDetailsRequest = {
  payGovTrackingId: string;
};

export type TransactionDetails = {
  trackingId: string;
  transactionStatus: TransactionStatus;
};

export type GetDetails = (
  appContext: AppContext,
  params: {
    client: ClientPermission;
    request: GetDetailsRequest;
  },
) => Promise<TransactionDetails>;

export const getDetails: GetDetails = async (appContext, { request }) => {
  const { payGovTrackingId } = request;

  const transaction = await TransactionModel.findByPaygovTrackingId(payGovTrackingId);
  if (!transaction) {
    throw new NotFoundError(`Transaction not found for payGovTrackingId: ${payGovTrackingId}`);
  }

  const fee = await FeesModel.getFeeById(transaction.feeId);
  if (!fee || !fee.tcsAppId) {
    throw new NotFoundError(`Fee not found for feeId: ${transaction.feeId}`);
  }

  const req = new GetRequestRequest({
    tcsAppId: fee.tcsAppId,
    payGovTrackingId,
  });

  console.log(`getDetails request:`, req);

  const result = await req.makeSoapRequest(appContext);

  console.log(`getDetails result:`, result);

  return {
    trackingId: result.paygov_tracking_id,
    transactionStatus: parseTransactionStatus(result.transaction_status),
  };
};
