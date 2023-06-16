import path from "path";
import { readFileSync } from "fs";
import * as soap from "soap";
import { initPayment } from "./useCases/initPayment";
import { processPayment } from "./useCases/processPayment";
import { AppContext } from "./types/AppContext";
import * as https from "https";

let soapClient: soap.Client;
let httpsAgent: https.Agent;

export const createAppContext = (): AppContext => {
  return {
    getSoapClient: async (): Promise<soap.Client> => {
      if (!soapClient) {
        if (process.env.NODE_ENV === "development") {
          const params = {
            forceSoap12Headers: true,
            wsdl_headers: {
              Authentication: `Bearer ${process.env.API_TOKEN}`,
            },
          };
          soapClient = await soap.createClientAsync(
            process.env.SOAP_URL!,
            params
          );
          soapClient.addSoapHeader({
            Authentication: process.env.API_TOKEN,
          });
        } else {
          // we will need to provide a certificate somehow!?
        }
      }
      return soapClient;
    },
    getHttpsAgent: () => {
      if (!httpsAgent) {
        const privateKeyPath = path.resolve(
          __dirname,
          `../certs/${process.env.NODE_ENV}-privatekey.pem`
        );
        const certificatePath = path.resolve(
          __dirname,
          `../certs/${process.env.NODE_ENV}-certificate.pem`
        );

        const privateKey = readFileSync(privateKeyPath, "utf-8");
        const certificate = readFileSync(certificatePath, "utf-8");

        const httpsAgentOptions = {
          key: privateKey,
          cert: certificate,
          passphrase: process.env.CERT_PASSPHRASE,
          keepAlive: true,
        };

        console.log("ok");

        // Create an HTTPS agent using the certificate options
        httpsAgent = new https.Agent(httpsAgentOptions);
      }
      return httpsAgent;
    },
    getUseCases: () => ({
      initPayment,
      processPayment,
    }),
  };
};
