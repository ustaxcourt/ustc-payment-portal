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

export const getDetails: GetDetails = async (
  appContext,
  params,
) => {
  const {
    client: _client,
    request,
  } = params;
  void _client;
  const { payGovTrackingId } = request;

  const req = new GetRequestRequest({
    tcsAppId: "", // Required by Pay.gov SOAP schema. TODO: once fees table is provisioned, tcsAppId will be pulled from the DB fees record using the feeId associated with this transaction
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
