import fetch from "node-fetch";

import type { APIGatewayProxyResult } from "aws-lambda";
import { createAppContext } from "./appContext";
import { getSecretString } from "./clients/secretsClient";
import { emitPayGovHealthMetric } from "./health/payGovHealthMetric";

// Handler for the /test endpoint. Also serves as the scheduled Pay.gov health
// probe: an EventBridge rule invokes it every ~15 min, and each run publishes a
// PayGovHealthy CloudWatch metric (healthy = the WSDL probe returned a 2xx).
// The HTTP response is unchanged for on-demand callers; EventBridge ignores it.
export const handler = async (): Promise<APIGatewayProxyResult> => {
  const appContext = createAppContext();
  try {
    const httpsAgent = await appContext.getHttpsAgent();

    const headers: { Authorization?: string; Authentication?: string } = {};

    const tokenId = process.env.PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID;
    if (tokenId) {
      try {
        const token = await getSecretString(tokenId);
        headers.Authorization = `Bearer ${token}`;
        headers.Authentication = headers.Authorization;
      } catch {
        // Proceed without Authorization header if token fetch fails
      }
    }

    const startedAt = Date.now();
    const result = await fetch(`${process.env.SOAP_URL}?wsdl`, {
      agent: httpsAgent,
      headers,
    });

    const resultText = await result.text();

    // Healthy = Pay.gov's server responded to the WSDL probe with a 2xx.
    emitPayGovHealthMetric(result.ok, Date.now() - startedAt);

    return {
      statusCode: 200,
      body: resultText,
    };
  } catch (err) {
    appContext.logger.error("Pay.gov health probe failed", {
      errorName: err instanceof Error ? err.name : undefined,
      errorMessage: err instanceof Error ? err.message : String(err),
      errorStack: err instanceof Error ? err.stack : undefined,
    });
    // -1 latency = the probe failed before Pay.gov responded (no meaningful timing).
    emitPayGovHealthMetric(false, -1);
    return {
      statusCode: 500,
      body: "not ok",
    };
  }
};
