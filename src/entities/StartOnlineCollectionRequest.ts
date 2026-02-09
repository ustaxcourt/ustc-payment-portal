import { RawStartOnlineCollectionRequest } from "../types/RawStartOnlineCollectionRequest";
import { AppContext } from "../types/AppContext";
import { StartOnlineCollectionResponse } from "../types/StartOnlineCollectionResponse";
import { RequestType, SoapRequest } from "./SoapRequest";
import { StartOnlineCollectionSchema } from "../schemas";

export const startOnlineCollectionSchema = StartOnlineCollectionSchema;

export type StartOnlineCollectionRequestParams = {
  tcs_app_id: string;
  agency_tracking_id: string;
  transaction_type: string;
  transaction_amount: string;
  language: string;
  url_success: string;
  url_cancel: string;
};

export class StartOnlineCollectionRequest extends SoapRequest {
  public agencyTrackingId: string;
  public transactionAmount: string;
  public urlCancel: string;
  public urlSuccess: string;
  public transactionType: string = "Sale";
  public language: string = "en";
  private requestType: RequestType = "startOnlineCollection";

  constructor(request: RawStartOnlineCollectionRequest) {
    super(request);

    this.agencyTrackingId = request.agencyTrackingId;
    this.transactionAmount = (
      Math.round(request.transactionAmount * 100) / 100
    ).toFixed(2);
    this.urlCancel = request.urlCancel;
    this.urlSuccess = request.urlSuccess;
  }

  makeSoapRequest(
    appContext: AppContext
  ): Promise<StartOnlineCollectionResponse> {
    return this.useHttp(appContext);
  }

  async useHttp(
    appContext: AppContext
  ): Promise<StartOnlineCollectionResponse> {
    const params: StartOnlineCollectionRequestParams = {
      tcs_app_id: this.tcsAppId,
      agency_tracking_id: this.agencyTrackingId,
      transaction_type: this.transactionType,
      transaction_amount: this.transactionAmount,
      language: this.language,
      url_success: this.urlSuccess,
      url_cancel: this.urlCancel,
    };

    const response = await SoapRequest.prototype.makeRequest(
      appContext,
      params,
      this.requestType
    );

    const tokenResponse = response["ns2:startOnlineCollectionResponse"]
      .startOnlineCollectionResponse as StartOnlineCollectionResponse;

    return tokenResponse;
  }
}
