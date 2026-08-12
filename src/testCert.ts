import { getPayGovAuthHeaders } from "@clients/payGovAuthHeaders";
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { createAppContext } from "./appContext";
import { emitPayGovHealthMetric } from "./health/payGovHealthMetric";
import { probePayGovWsdl } from "./health/probePayGovWsdl";

export { healthHandler } from "./healthCheckHandler";

type TestCertEvent = { healthProbe?: boolean } | APIGatewayProxyEvent;

export const handler = async (
  event?: TestCertEvent,
): Promise<APIGatewayProxyResult> => {
  const isScheduledProbe =
    !!event && "healthProbe" in event && event.healthProbe === true;
  return runWsdlProbe(isScheduledProbe);
};

async function runWsdlProbe(
  isScheduledProbe: boolean,
): Promise<APIGatewayProxyResult> {
  const appContext = createAppContext();
  try {
    const httpsAgent = await appContext.getHttpsAgent();
    const headers = await getPayGovAuthHeaders(appContext.logger);

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
