import { RawStartOnlineCollectionRequest } from "../types/RawStartOnlineCollectionRequest";
import { AppContext } from "../types/AppContext";
import { FailedTransactionError } from "../errors/failedTransaction";
import { RequestType, SoapRequest } from "./SoapRequest";
import {
  StartOnlineCollectionResponse,
  StartOnlineCollectionResponseSchema,
} from "../schemas/StartOnlineCollectionResponse.schema";

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

    const responseBody = await SoapRequest.prototype.makeRequest(
      appContext,
      params,
      this.requestType
    );

    if (responseBody["ns2:startOnlineCollectionResponse"]) {
      const raw =
        responseBody["ns2:startOnlineCollectionResponse"]
          .startOnlineCollectionResponse;
      const parsed = StartOnlineCollectionResponseSchema.safeParse(raw);
      if (!parsed.success) {
        console.error(
          "startOnlineCollection schema validation failed",
          JSON.stringify({ raw, errors: parsed.error.issues })
        );
        throw parsed.error;
      }
      return parsed.data;
    }

    throw this.handleFault(responseBody["S:Fault"]);
  }

  handleFault = (fault: ProcessorFault) => {
    if (!fault) {
      return new FailedTransactionError(
        "Unexpected response from Pay.gov: no fault detail returned"
      );
    }

    if (!fault.detail || !fault.detail["ns2:TCSServiceFault"]) {
      return new FailedTransactionError(
        "Pay.gov returned a fault without error details"
      );
    }

    return new FailedTransactionError(
      fault.detail["ns2:TCSServiceFault"].return_detail,
      Number(fault.detail["ns2:TCSServiceFault"].return_code)
    );
  };
}

type ProcessorFault =
  | {
      faultcode: string;
      faultstring: string;
      detail?: {
        "ns2:TCSServiceFault"?: {
          return_code: string;
          return_detail: string;
        };
      };
    }
  | undefined;
