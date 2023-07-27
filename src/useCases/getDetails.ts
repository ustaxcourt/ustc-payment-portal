import { GetRequestRequest } from "../entities/GetDetailsRequest";
import { AppContext } from "../types/AppContext";
import { TransactionStatus } from "../types/TransactionStatus";

export type GetDetailsRequest = {
  appId: string;
  payGovTrackingId: string;
};

export type TransactionDetails = {
  trackingId: string;
  transactionStatus: TransactionStatus;
};

export type GetDetails = (
  appContext: AppContext,
  { appId, payGovTrackingId }: GetDetailsRequest
) => Promise<TransactionDetails>;

export const getDetails: GetDetails = async (
  appContext,
  { appId, payGovTrackingId }
) => {
  const req = new GetRequestRequest({
    tcsAppId: appId,
    payGovTrackingId,
  });

  const result = await req.makeSoapRequest(appContext);

  return {
    trackingId: result.paygov_tracking_id,
    transactionStatus: result.transaction_status,
  };
};
