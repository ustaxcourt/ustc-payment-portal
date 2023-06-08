import * as soap from "soap";
import { AppContext } from "../types/AppContext";

type InitPaymentRequest = {
  trackingId: string;
  amount: number;
  urlSuccess: string;
  urlCancel: string;
};

type InitPaymentResponse = {
  token: string;
};

type StartOnlineCollectionRequest = {
  startOnlineCollection: {
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
};

export async function initPayment(
  appContext: AppContext,
  request: InitPaymentRequest
): Promise<InitPaymentResponse> {
  const args: StartOnlineCollectionRequest = {
    startOnlineCollection: {
      startOnlineCollectionRequest: {
        tcs_appid: "asdf123",
        agency_tracking_id: request.trackingId,
        transaction_type: "sale",
        transaction_amount: request.amount,
        language: "en_us",
        url_cancel: request.urlCancel,
        url_success: request.urlSuccess,
      },
    },
  };

  const client = await appContext.getSoapClient();
  const result = await makeSoapRequest(client, args);
  return result;
}

const makeSoapRequest = async (
  client: soap.Client,
  args: StartOnlineCollectionRequest
): Promise<InitPaymentResponse> =>
  new Promise((resolve, reject) => {
    client.startOnlineCollection(
      args,
      function (
        err: Error,
        result: { startOnlineCollectionResponse: InitPaymentResponse }
      ) {
        if (err) {
          reject(err);
        } else {
          resolve(result.startOnlineCollectionResponse);
        }
      }
    );
  });
