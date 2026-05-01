import { AppContext } from "../types/AppContext";
import { FailedTransactionError } from "../errors/failedTransaction";
import { RawCompleteOnlineCollectionRequest } from "../types/RawCompleteOnlineCollectionRequest";
import { RequestType, SoapRequest } from "./SoapRequest";
import {
  CompleteOnlineCollectionWithDetailsResponse,
  CompleteOnlineCollectionWithDetailsResponseSchema,
} from "../schemas/CompleteOnlineCollectionWithDetailsResponse.schema";

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

    if (responseBody["ns2:completeOnlineCollectionWithDetailsResponse"]) {
      const raw = responseBody["ns2:completeOnlineCollectionWithDetailsResponse"]
        .completeOnlineCollectionWithDetailsResponse;
      const parsed = CompleteOnlineCollectionWithDetailsResponseSchema.safeParse(raw);
      if (!parsed.success) {
        console.error("completeOnlineCollectionWithDetails schema validation failed", JSON.stringify({ raw, errors: parsed.error.issues }));
        throw parsed.error;
      }
      return parsed.data;
    } else {
      throw this.handleFault(responseBody["S:Fault"]);
    }
  };

  handleFault = (fault: ProcessorFault) => {
    if (!fault) {
      return new FailedTransactionError("Unexpected response from Pay.gov: no fault detail returned");
    }

    if (!fault.detail || !fault.detail["ns2:TCSServiceFault"]) {
      return new FailedTransactionError("Pay.gov returned a fault without error details");
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
    detail: {
      "ns2:TCSServiceFault": {
        return_code: string;
        return_detail: string;
      };
    };
  }
  | undefined;


