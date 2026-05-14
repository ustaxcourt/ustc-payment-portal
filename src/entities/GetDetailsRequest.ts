import { AppContext } from "../types/AppContext";
import { PayGovTransactionStatus } from "../types/TransactionStatus";
import { RequestType, SoapRequest } from "./SoapRequest";
import { PayGovGetDetailsResponseSchema } from "../schemas/PayGovGetDetailsResponse.schema";

export type RawGetDetailsRequest = {
  tcsAppId: string;
  payGovTrackingId: string;
};

export type TransactionDetails = {
  paygov_tracking_id: string;
  transaction_status: PayGovTransactionStatus;
  agency_tracking_id: string;
  transaction_amount: number;
  payment_type?: string;
  transaction_date?: string;
  payment_date?: string;
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
    appContext: AppContext
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
      this.requestType
    );

    const raw = responseBody["ns2:getDetailsResponse"]?.getDetailsResponse;
    const parsed = PayGovGetDetailsResponseSchema.safeParse(raw);
    if (!parsed.success) {
      // Logging the raw response so on-call can diagnose Pay.gov contract drift.
      // Pay.gov's getDetails response does not contain PCI data — payment_type is a
      // string like "ACH"/"PLASTIC_CARD" and tracking IDs are server-side identifiers,
      // not cardholder data. If that ever changes, redact before logging.
      console.error(
        "getDetails schema validation failed",
        JSON.stringify({ raw, errors: parsed.error.issues })
      );
      throw parsed.error;
    }

    const wrapper = Array.isArray(parsed.data.transactions)
      ? parsed.data.transactions[0]
      : parsed.data.transactions;
    return wrapper.transaction;
  };
}
