import * as soap from "soap";
import { initPayment } from "./useCases/initPayment";
import { processPayment } from "./useCases/processPayment";
import { AppContext } from "./types/AppContext";

let soapClient: soap.Client;

export const createAppContext = (): AppContext => {
  return {
    getSoapClient: async (): Promise<soap.Client> => {
      if (!soapClient) {
        soapClient = await soap.createClientAsync(process.env.SOAP_URL, {
          forceSoap12Headers: true,
        });
      }
      return soapClient;
    },
    getUseCases: () => ({
      initPayment,
      processPayment,
    }),
  };
};
