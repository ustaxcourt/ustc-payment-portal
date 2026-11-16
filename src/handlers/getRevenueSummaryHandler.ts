import type { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { createAppContext } from "../appContext";
import { RevenueSummaryQuerySchema } from "@schemas/RevenueSummary.schema";
import {
  dashboardOk,
  dashboardError,
  dashboardValidationError,
} from "@utils/dashboardHandlerUtils";

/** GET /revenue-summary — the dashboard totals table's one call: per-period
 *  totals with fee tallies, plus YoY trends. Takes no parameters, by rule. */
export const getRevenueSummaryHandler = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  const appContext = createAppContext({ lambdaRequest: event });

  const query = RevenueSummaryQuerySchema.safeParse(
    event.queryStringParameters ?? {},
  );
  if (!query.success) {
    return dashboardValidationError(query.error.issues);
  }

  try {
    const result = await appContext.getUseCases().getRevenueSummary(appContext);
    return dashboardOk(result);
  } catch (err) {
    appContext.logger.error("getRevenueSummary failed", {
      errorName: err instanceof Error ? err.name : undefined,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return dashboardError(500, "Internal server error");
  }
};
