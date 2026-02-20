import { AppContext } from "../types/AppContext";
import { PayGovTransactionStatus } from "../types/TransactionStatus";
import { RequestType, SoapRequest } from "./SoapRequest";

export type RawGetDetailsRequest = {
  tcsAppId: string;
  payGovTrackingId: string;
};

export type TransactionDetails = {
  paygov_tracking_id: string;
  transaction_status: PayGovTransactionStatus;
  agency_tracking_id: string;
  transaction_amount: string;
};

export type TransactionDetail = {
  transaction: TransactionDetails;
};

export type GetDetailsResponse = {
  transactions: TransactionDetail | TransactionDetail[];
};

export type GetRequestRequestParams = {
  paygov_tracking_id: string;
  tcs_app_id: string;
};

export class GetRequestRequest extends SoapRequest {
  private payGovTrackingId;
  private requestType: RequestType = "getDetails";

  constructor(request: RawGetDetailsRequest) {
    super(request);
    this.payGovTrackingId = request.payGovTrackingId;
  }

  makeSoapRequest = async (
    appContext: AppContext,
  ): Promise<TransactionDetails> => {
    return this.useHttp(appContext);
  };

  useHttp = async (appContext: AppContext): Promise<TransactionDetails> => {
    const params: GetRequestRequestParams = {
      tcs_app_id: this.tcsAppId,
      paygov_tracking_id: this.payGovTrackingId,
    };

    const responseBody = await SoapRequest.prototype.makeRequest(
      appContext,
      params,
      this.requestType,
    );

    const response = responseBody["ns2:getDetailsResponse"]
      .getDetailsResponse as GetDetailsResponse;

    console.log(`getDetails api response`, response);

    if ("transaction" in response.transactions) {
      return response.transactions.transaction;
    } else if (response.transactions.length > 0) {
      return response.transactions[0].transaction;
    } else {
      throw new Error("Could not find any transaction details");
    }
  };
}
