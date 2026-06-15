import { getSecretString } from "./clients/secretsClient";
import { getParameter } from "./clients/ssmClient";
import { isLocal, getAppEnv } from "./config/appEnv";
import { FEE_KEYS, type FeeKey } from "./fees";
import { AppContext } from "./types/AppContext";
import { getDetails } from "./useCases/getDetails";
import { initPayment } from "./useCases/initPayment";
import { processPayment } from "./useCases/processPayment";
import { getRecentTransactions } from "./useCases/getRecentTransactions";
import { getTransactionsByStatus } from "./useCases/getTransactionsByStatus";
import { getTransactionPaymentStatus } from "./useCases/getTransactionPaymentStatus";
import * as https from "https";
import fetch from "node-fetch";
import { createRequestLogger } from "./utils/logger";
import type { APIGatewayEvent } from "aws-lambda";

let httpsAgentCache: https.Agent | undefined;
let tcsAppIdsCache: Record<FeeKey, string> | undefined;

// Local dev values mirror the sandbox Pay.gov app IDs used in the test server.
const LOCAL_TCS_APP_IDS: Record<FeeKey, string> = {
  PETITION_FILING_FEE: 'TCSUSTAXCOURTPETITION',
  NONATTORNEY_EXAM_REGISTRATION_FEE: 'TCSUSTAXCOURTANAEF',
};

function normalizePem(pem: string): string {
  return pem.replace(/\r\n/g, "\n").trimEnd() + "\n";
}

type LocalRequestContext = {
  method: string;
  path: string;
  transactionReferenceId?: string;
};

type AppContextContext = {
  localRequest?: LocalRequestContext;
  lambdaRequest?: APIGatewayEvent;
};

export const createAppContext = (
  context: AppContextContext = {},
): AppContext => {
  const { localRequest, lambdaRequest } = context;
  const requestContext = localRequest
    ? {
        httpMethod: localRequest.method,
        path: localRequest.path,
        transactionReferenceId: localRequest.transactionReferenceId,
      }
    : lambdaRequest
    ? {
        httpMethod: lambdaRequest.httpMethod,
        awsRequestId: lambdaRequest.requestContext.requestId,
        path: lambdaRequest.path,
        clientArn: lambdaRequest.requestContext.identity.userArn ?? undefined,
        transactionReferenceId:
          lambdaRequest.queryStringParameters?.transactionReferenceId,
      }
    : {};

  const logger = createRequestLogger(requestContext);

  return {
    getTcsAppIds: async (feeKey: string) => {
      if (isLocal()) return LOCAL_TCS_APP_IDS;
      const env = getAppEnv();

      const value = await getParameter(`/ustc/pay-gov/${env}/tcs-app-id/${feeKey}`);

      return value;
    },
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
      body: string,
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
        if (isLocal()) {
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
              },
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
      getRecentTransactions,
      getTransactionPaymentStatus,
      getTransactionsByStatus,
    }),
    logger,
  };
};
