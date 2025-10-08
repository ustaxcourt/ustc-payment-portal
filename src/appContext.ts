import { getSecretValue } from "./clients/secretsClient";
import { AppContext } from "./types/AppContext";
import { getDetails } from "./useCases/getDetails";
import { initPayment } from "./useCases/initPayment";
import { processPayment } from "./useCases/processPayment";
import * as https from "https";
import fetch from "node-fetch";

let httpsAgentCache: https.Agent;

export const createAppContext = (): AppContext => {
  return {
    getHttpsAgent: async () => {
      if (!httpsAgentCache) {
        const privateKey = await getSecretValue("keySECRET"); // UPDATE THIS TO BE THE ACTUAL SECRET NAME!
        const certificate = await getSecretValue("certSECRET"); // UPDATE THIS TO BE THE ACTUAL SECRET NAME!

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
        httpsAgent = await appContext.getHttpsAgent();
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
