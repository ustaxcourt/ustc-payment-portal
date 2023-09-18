import { AppContext } from "../types/AppContext";
import { TransactionStatus } from "../types/TransactionStatus";
import { RawCompleteOnlineCollectionRequest } from "../types/RawCompleteOnlineCollectionRequest";
import { RequestType, SoapRequest } from "./SoapRequest";

type CompleteOnlineCollectionWithDetailsResponse = {
  paygov_tracking_id: string;
  transaction_status: TransactionStatus;
  agency_tracking_id: string;
  transaction_amount: string;
};

export type CompleteOnlineCollectionWithDetailsRequestParams = {
  tcs_app_id: string;
  token: string;
};

export class CompleteOnlineCollectionWithDetailsRequest extends SoapRequest {
  public token: string;
  private requestType: RequestType = "completeOnlineCollectionWithDetails";

  constructor(request: RawCompleteOnlineCollectionRequest) {
    super(request);
    this.token = request.token;
  }

  makeSoapRequest = async (
    appContext: AppContext
  ): Promise<CompleteOnlineCollectionWithDetailsResponse> => {
    return this.useHttp(appContext);
  };

  useHttp = async (
    appContext: AppContext
  ): Promise<CompleteOnlineCollectionWithDetailsResponse> => {
    const params: CompleteOnlineCollectionWithDetailsRequestParams = {
      tcs_app_id: this.tcsAppId,
      token: this.token,
    };
    const responseBody = await SoapRequest.prototype.makeRequest(
      appContext,
      params,
      this.requestType
    );

    const response = responseBody[
      "ns2:completeOnlineCollectionWithDetailsResponse"
    ]
      .completeOnlineCollectionWithDetailsResponse as CompleteOnlineCollectionWithDetailsResponse;

    return response;
  };
}
