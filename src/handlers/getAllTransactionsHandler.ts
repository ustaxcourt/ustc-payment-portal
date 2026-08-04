import { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { createAppContext } from "../appContext";
import { dashboardOk, dashboardError } from "@utils/dashboardHandlerUtils";

/** GET /transactions — 100 most recent across all statuses.
 *  Consumed by ustc-payment-portal-dev-dashboard; keep this shape stable. */
export const getAllTransactionsHandler = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  const appContext = createAppContext({ lambdaRequest: event });
  try {
    const result = await appContext
      .getUseCases()
      .getRecentTransactions(appContext);
    return dashboardOk(result);
  } catch (err) {
    console.error("[Dashboard] getAllTransactions error:", err);
    return dashboardError(500, "Internal server error");
  }
};
