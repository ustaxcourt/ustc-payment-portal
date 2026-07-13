import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { createAppContext } from "./appContext";
import { getSecretString } from "@clients/secretsClient";
import { emitPayGovHealthMetric } from "./health/payGovHealthMetric";
import { probePayGovWsdl } from "./health/probePayGovWsdl";
import { runDeployHealthCheck } from "@useCases/runDeployHealthCheck";

type TestCertEvent = { healthProbe?: boolean } | APIGatewayProxyEvent;

// Handler for /test and /health, plus the scheduled Pay.gov health probe.
//   - API GW GET /health  → synthetic, read-only deploy health check (JSON)
//   - API GW GET /test    → on-demand Pay.gov WSDL response (unchanged)
//   - { healthProbe: true }→ EventBridge probe; emits PayGovHealthy metric
export const handler = async (
  event?: TestCertEvent,
): Promise<APIGatewayProxyResult> => {
  if (event && "requestContext" in event) {
    const route = event.resource ?? event.path ?? "";
    if (route.endsWith("/health")) {
      const appContext = createAppContext({ lambdaRequest: event });
      const report = await runDeployHealthCheck(appContext);
      appContext.logger.info("deploy health check", { checks: report.checks });
      return {
        statusCode: report.status === "healthy" ? 200 : 503,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
      };
    }
  }

  const isScheduledProbe =
    !!event && "healthProbe" in event && event.healthProbe === true;
  return runWsdlProbe(isScheduledProbe);
};

// On-demand /test response and scheduled Pay.gov WSDL probe. The scheduled run
// publishes a PayGovHealthy CloudWatch metric; on-demand callers get the WSDL.
async function runWsdlProbe(
  isScheduledProbe: boolean,
): Promise<APIGatewayProxyResult> {
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

    const { ok, latencyMs, body } = await probePayGovWsdl(httpsAgent, headers);
    if (isScheduledProbe) {
      emitPayGovHealthMetric(ok, latencyMs);
    }

    return {
      statusCode: 200,
      body,
    };
  } catch (err) {
    appContext.logger.error("Pay.gov health probe failed", {
      errorName: err instanceof Error ? err.name : undefined,
      errorMessage: err instanceof Error ? err.message : String(err),
      errorStack: err instanceof Error ? err.stack : undefined,
    });
    // -1 latency = the probe failed before Pay.gov responded (no meaningful timing).
    if (isScheduledProbe) {
      emitPayGovHealthMetric(false, -1);
    }
    return {
      statusCode: 500,
      body: "not ok",
    };
  }
}
