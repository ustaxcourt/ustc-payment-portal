import * as soap from "soap";
import { initPayment } from "./useCases/initPayment";
import { processPayment } from "./useCases/processPayment";
import { AppContext } from "./types/AppContext";

let soapClient: soap.Client;

export const createAppContext = (): AppContext => {
  return {
    getSoapClient: async (): Promise<soap.Client> => {
      if (!soapClient) {
        const params = {
          forceSoap12Headers: true,
          wsdl_headers: {
            Authentication: `Bearer ${process.env.API_TOKEN}`,
          },
        };
        soapClient = await soap.createClientAsync(process.env.SOAP_URL, params);
        if (process.env.STAGE === "dev") {
          soapClient.addSoapHeader({
            Authentication: process.env.API_TOKEN,
          });
        } else {
          // we will need to provide a certificate somehow!?
        }
      }
      return soapClient;
    },
    getUseCases: () => ({
      initPayment,
      processPayment,
    }),
  };
};
