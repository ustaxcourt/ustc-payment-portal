import * as soap from "soap";
import { AppContext } from "../types/AppContext";

export type InitPaymentRequest = {
  trackingId: string;
  amount: number;
  appId: string;
  urlSuccess: string;
  urlCancel: string;
};

type InitPaymentResponse = {
  token: string;
  paymentRedirect: string;
};

type RawStartOnlineCollectionRequest = {
  tcs_appid: string;
  agency_tracking_id: string;
  transaction_amount: number;
  url_cancel: string;
  url_success: string;
};

type StartOnlineCollectionResponse = {
  token: string;
};

class StartOnlineCollectionRequest {
  public agency_tracking_id: string;
  public transaction_amount: number;
  public tcs_appid: string;
  public url_cancel: string;
  public url_success: string;
  public transaction_type: string = "sale";
  public language: string = "en_us";

  constructor(request: RawStartOnlineCollectionRequest) {
    this.agency_tracking_id = request.agency_tracking_id;
    this.tcs_appid = request.tcs_appid;
    this.transaction_amount = request.transaction_amount;
    this.url_cancel = request.url_cancel;
    this.url_success = request.url_success;
  }

  async makeSoapRequest(
    appContext: AppContext
  ): Promise<StartOnlineCollectionResponse> {
    const result = (await this.useSoap(
      appContext
    )) as StartOnlineCollectionResponse;
    // possible useHttps(appContext)
    return result;
  }

  async useSoap(appContext: AppContext) {
    const client = await appContext.getSoapClient();

    return new Promise((resolve, reject) => {
      client.startOnlineCollection(
        {
          startOnlineCollectionRequest: {
            agency_tracking_id: this.agency_tracking_id,
            transaction_amount: this.transaction_amount,
            tcs_appid: this.tcs_appid,
            url_cancel: this.url_cancel,
            url_success: this.url_success,
            transaction_type: this.transaction_type,
            language: this.language,
          },
        },
        function (
          err: Error,
          result: {
            startOnlineCollectionResponse: {
              token: string;
            };
          }
        ) {
          if (err) {
            reject(err);
          } else {
            resolve(
              result.startOnlineCollectionResponse as StartOnlineCollectionResponse
            );
          }
        }
      );
    });
  }

  async useHttp(appContext: AppContext) {

  }
}

export async function initPayment(
  appContext: AppContext,
  request: InitPaymentRequest
): Promise<InitPaymentResponse> {
  
  const req = new StartOnlineCollectionRequest({
    tcs_appid: request.appId,
    transaction_amount: request.amount,
    url_cancel: request.urlCancel,
    url_success: request.urlSuccess,
    agency_tracking_id: request.trackingId,
  });

  const result = await req.makeSoapRequest(appContext);

  return {
    token: result.token,
    paymentRedirect: `${process.env.PAYMENT_URL}?token=${result.token}&tcsAppID=${request.appId}`,
  };
}
