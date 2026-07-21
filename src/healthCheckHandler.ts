import { runDeployHealthCheck } from "@useCases/runDeployHealthCheck";
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { createAppContext } from "./appContext";

export const healthHandler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const appContext = createAppContext({ lambdaRequest: event });
  const releaseTag = Object.entries(event.headers ?? {}).find(
    ([name]) => name.toLowerCase() === "x-deploy-tag",
  )?.[1];
  const report = await runDeployHealthCheck(appContext, releaseTag);
  appContext.logger.info("deploy health check", { checks: report.checks });
  return {
    statusCode: report.status === "healthy" ? 200 : 503,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report),
  };
};
