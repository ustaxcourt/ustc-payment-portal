import * as soap from "soap";
import { AppContext } from "../types/AppContext";

export type ProcessPaymentRequest = {
  appId: string;
  token: string;
};

type ProcessPaymentResponse = {
  trackingId: string;
};

type CompleteOnlineCollectionRequest = {
  completeOnlineCollectionRequest: {
    tcs_app_id: string;
    token: string;
  };
};

export async function processPayment(
  appContext: AppContext,
  request: ProcessPaymentRequest
): Promise<ProcessPaymentResponse> {
  const args: CompleteOnlineCollectionRequest = {
    completeOnlineCollectionRequest: {
      tcs_app_id: request.appId,
      token: request.token,
    },
  };

  const client = await appContext.getSoapClient();

  const result = await makeSoapRequest(client, args);
  console.log(result);
  return {
    trackingId: result.pay_gov_tracking_id,
  };
}

const makeSoapRequest = async (
  client: soap.Client,
  args: CompleteOnlineCollectionRequest
): Promise<{ pay_gov_tracking_id: string }> =>
  new Promise((resolve, reject) => {
    client.completeOnlineCollection(
      args,
      function (
        err: Error,
        result: {
          completeOnlineCollectionResponse: {
            pay_gov_tracking_id: string;
          };
        }
      ) {
        if (err) {
          reject(err);
        } else {
          resolve(result.completeOnlineCollectionResponse);
        }
      }
    );
  });
