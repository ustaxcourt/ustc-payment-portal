import { ClientPermission } from "../types/ClientPermission";
import { GetRequestRequest } from "../entities/GetDetailsRequest";
import { AppContext } from "../types/AppContext";
import { TransactionStatus } from "../types/TransactionStatus";
import { parseTransactionStatus } from "./parseTransactionStatus";

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

  const req = new GetRequestRequest({
    tcsAppId: "", // TODO: once "Process Payment: track in database" ticket lands and paygovTrackingId is persisted, look up the Transaction and its Fee to get the tcsAppId
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
