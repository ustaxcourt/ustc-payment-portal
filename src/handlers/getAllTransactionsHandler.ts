import type { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { createAppContext } from "../appContext";
import { TransactionsQuerySchema } from "@schemas/TransactionsQuery.schema";
import { dashboardOk, dashboardError } from "@utils/dashboardHandlerUtils";

/**
 * GET /transactions
 * Returns the 100 most recent transactions across all statuses.
 */
export const getAllTransactionsHandler = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  const appContext = createAppContext({ lambdaRequest: event });
  const query = event.queryStringParameters ?? {};

  try {
    if (Object.keys(query).length > 0) {
      const parsedQuery = TransactionsQuerySchema.safeParse(query);
      if (!parsedQuery.success) {
        return dashboardError(400, parsedQuery.error.issues[0].message);
      }

      const result = await appContext
        .getUseCases()
        .getTransactionLog(appContext, parsedQuery.data);
      return dashboardOk(result);
    }

    const result = await appContext
      .getUseCases()
      .getRecentTransactions(appContext);
    return dashboardOk(result);
  } catch (err) {
    console.error("[Dashboard] getAllTransactions error:", err);
    return dashboardError(500, "Internal server error");
  }
};
