import { AppContext } from "../types/AppContext";
import soap from "soap";

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

export const initPayment = async (
  appContext: AppContext,
  request: InitPaymentRequest
): Promise<InitPaymentResponse> => {
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

  const soapUrl = "http://localhost";
  const client = await soap.createClientAsync(soapUrl, {
    forceSoap12Headers: true,
  });

  const result = await makeSoapRequest(client, args);

  return { token: "asdf123" };
};

const makeSoapRequest = (
  client: soap.Client,
  args: StartOnlineCollectionRequest
) =>
  new Promise((resolve, reject) => {
    try {
      client.startOnlineCollectionRequest(args, resolve);
    } catch (err) {
      console.log("err", err);
      reject(err);
    }
  });
