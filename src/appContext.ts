import { getSecretBinary } from "./clients/secretsClient";
import { AppContext } from "./types/AppContext";
import { getDetails } from "./useCases/getDetails";
import { initPayment } from "./useCases/initPayment";
import { processPayment } from "./useCases/processPayment";
import { readFileSync } from "fs";
import * as https from "https";
import fetch from "node-fetch";
import path from "path";

let httpsAgentCache: https.Agent;

export const createAppContext = (): AppContext => {
  return {
    getHttpsAgent: () => {
      if (!httpsAgentCache) {
        const privateKeyPath = path.resolve(
          __dirname,
          `../certs/${process.env.NODE_ENV}-privatekey.pem`
        );
        const certificatePath = path.resolve(
          __dirname,
          `../certs/${process.env.NODE_ENV}-certificate.pem`
        );

        //Update these calls to be either getBinary or getSecret depending on what we actually need.
        const keyData = getSecretBinary("keySECRET");

        const certData = getSecretBinary("certSecret");


        // TODO: Use the above secret datas in the actual requests 
        const privateKey = readFileSync(privateKeyPath, "utf-8");
        const certificate = readFileSync(certificatePath, "utf-8");

        const httpsAgentOptions = {
          key: privateKey,
          cert: certificate,
          passphrase: process.env.CERT_PASSPHRASE,
          keepAlive: true,
        };

        // Create an HTTPS agent using the certificate options
        httpsAgentCache = new https.Agent(httpsAgentOptions);
      }
      return httpsAgentCache;
    },
    postHttpRequest: async (
      appContext: AppContext,
      body: string
    ): Promise<string> => {
      let httpsAgent: https.Agent | undefined;
      if (process.env.CERT_PASSPHRASE) {
        httpsAgent = appContext.getHttpsAgent();
      }

      const headers: {
        "Content-type": string;
        authentication?: string;
      } = {
        "Content-type": "application/soap+xml",
      };
      if (process.env.PAY_GOV_DEV_SERVER_TOKEN) {
        headers.authentication = `Bearer ${process.env.PAY_GOV_DEV_SERVER_TOKEN}`;
      }

      const result = await fetch(process.env.SOAP_URL, {
        method: "POST",
        headers,
        body,
        agent: httpsAgent,
      });

      const responseBody = await result.text();
      return responseBody;
    },
    getUseCases: () => ({
      initPayment,
      processPayment,
      getDetails,
    }),
  };
};
