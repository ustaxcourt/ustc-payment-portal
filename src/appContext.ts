import { getSecretString } from "./clients/secretsClient";
import { AppContext } from "./types/AppContext";
import { getDetails } from "./useCases/getDetails";
import { initPayment } from "./useCases/initPayment";
import { processPayment } from "./useCases/processPayment";
import * as https from "https";
import fetch from "node-fetch";

let httpsAgentCache: https.Agent | undefined;

function normalizePem(pem: string): string {
  return pem.replace(/\r\n/g, "\n").trimEnd() + "\n";
}

export const createAppContext = (): AppContext => {
  return {
    getHttpsAgent: async () => {
      if (!httpsAgentCache) {
        const keyId = process.env.PRIVATE_KEY_SECRET_ID;
        const certId = process.env.CERTIFICATE_SECRET_ID;
        const passId = process.env.CERT_PASSPHRASE_SECRET_ID; // optional

        // Only build an mTLS agent when both key and cert IDs are present (stg/prod)
        if (keyId && certId) {
          const [key, cert, passphrase] = await Promise.all([
            getSecretString(keyId),
            getSecretString(certId),
            passId ? getSecretString(passId) : Promise.resolve(undefined),
          ]);

          httpsAgentCache = new https.Agent({
            keepAlive: true,
            maxFreeSockets: 10,
            timeout: 30_000,
            key: normalizePem(key),
            cert: normalizePem(cert),
            passphrase,
          });
        }
      }
      return httpsAgentCache;
    },
    postHttpRequest: async (
      appContext: AppContext,
      body: string
    ): Promise<string> => {
      const httpsAgent = await appContext.getHttpsAgent();

      const headers: {
        "Content-type": string;
        Authorization?: string;
        Authentication?: string;
      } = {
        "Content-type": "application/soap+xml",
      };

      const tokenSecretId = process.env.PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID;

      if (tokenSecretId) {
        // When TEST_NAMESPACE is not set, we're running locally in dev mode
        if (!process.env.TEST_NAMESPACE) {
          headers.Authorization = `Bearer ${tokenSecretId}`;
          headers.Authentication = headers.Authorization;
        } else {
          try {
            const token = await getSecretString(tokenSecretId);
            headers.Authorization = `Bearer ${token}`;
            headers.Authentication = headers.Authorization;
          } catch (err: any) {
            console.warn(
              "[postHttpRequest] Failed to read token from Secrets Manager",
              {
                secretId: tokenSecretId,
                errorName: err?.name,
                errorMessage: err?.message,
              }
            );
            // Proceed without Authorization header if token fetch fails
          }
        }
      }

      const result = await fetch(process.env.SOAP_URL as string, {
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
