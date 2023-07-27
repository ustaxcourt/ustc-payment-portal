import path from "path";
import { readFileSync } from "fs";
import { initPayment } from "./useCases/initPayment";
import { getDetails } from "./useCases/getDetails";
import { processPayment } from "./useCases/processPayment";
import { AppContext } from "./types/AppContext";
import * as https from "https";
import fetch from "node-fetch";

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
    postHttpRequest: async (appContext: AppContext, body: string) => {
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
      return result;
    },
    getUseCases: () => ({
      initPayment,
      processPayment,
      getDetails,
    }),
  };
};
