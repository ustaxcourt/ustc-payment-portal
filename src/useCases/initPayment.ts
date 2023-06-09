import * as soap from "soap";
import { AppContext } from "../types/AppContext";

type InitPaymentRequest = {
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

type StartOnlineCollectionRequest = {
  startOnlineCollectionRequest: {
    tcs_appid: string;
    agency_tracking_id: string;
    transaction_type: "sale";
    transaction_amount: number;
    language: "en_us";
    url_cancel: string;
    url_success: string;
  };
};

export async function initPayment(
  appContext: AppContext,
  request: InitPaymentRequest
): Promise<InitPaymentResponse> {
  const args: StartOnlineCollectionRequest = {
    startOnlineCollectionRequest: {
      tcs_appid: request.appId,
      agency_tracking_id: request.trackingId,
      transaction_type: "sale",
      transaction_amount: request.amount,
      language: "en_us",
      url_cancel: request.urlCancel,
      url_success: request.urlSuccess,
    },
  };

  const client = await appContext.getSoapClient();
  const result = await makeSoapRequest(client, args);

  const toReturn = {
    token: result.token,
    paymentRedirect: `${process.env.PAYMENT_URL}?token=${result.token}&tcsAppID=${request.appId}`,
  };

  console.log(toReturn);

  return toReturn;
}

const makeSoapRequest = async (
  client: soap.Client,
  args: StartOnlineCollectionRequest
): Promise<{ token: string }> =>
  new Promise((resolve, reject) => {
    client.startOnlineCollection(
      args,
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
          resolve(result.startOnlineCollectionResponse);
        }
      }
    );
  });
