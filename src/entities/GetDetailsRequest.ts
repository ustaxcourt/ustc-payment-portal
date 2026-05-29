import { AppContext } from "../types/AppContext";
import { RequestType, SoapRequest } from "./SoapRequest";
import {
  PayGovGetDetailsResponseSchema,
  PayGovGetDetailsTransaction,
} from "../schemas/PayGovGetDetailsResponse.schema";

export type RawGetDetailsRequest = {
  tcsAppId: string;
  payGovTrackingId: string;
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
  ): Promise<PayGovGetDetailsTransaction> => {
    return this.useHttp(appContext);
  };

  useHttp = async (
    appContext: AppContext,
  ): Promise<PayGovGetDetailsTransaction> => {
    const params: GetRequestRequestParams = {
      tcs_app_id: this.tcsAppId,
      paygov_tracking_id: this.payGovTrackingId,
    };

    const responseBody = await SoapRequest.prototype.makeRequest(
      appContext,
      params,
      this.requestType,
    );

    if (responseBody["ns2:getDetailsResponse"]) {
      const raw = responseBody["ns2:getDetailsResponse"].getDetailsResponse;
      const parsed = PayGovGetDetailsResponseSchema.safeParse(raw);
      if (!parsed.success) {
        // Pay.gov's getDetails response does not contain PCI data — payment_type is
        // a string like "ACH"/"PLASTIC_CARD" and tracking IDs are server-side
        // identifiers, not cardholder data. If that ever changes, redact before logging.
        console.error(
          "getDetails schema validation failed",
          JSON.stringify({ raw, errors: parsed.error.issues }),
        );
        throw parsed.error;
      }

      const wrapper = Array.isArray(parsed.data.transactions)
        ? parsed.data.transactions[0]
        : parsed.data.transactions;
      return wrapper.transaction;
    }

    throw this.handleFault(responseBody["S:Fault"]);
  };
}
