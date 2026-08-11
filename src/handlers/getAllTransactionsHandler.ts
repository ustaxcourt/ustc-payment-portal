import {
  TRANSACTIONS_QUERY_PARAM_KEYS,
  TransactionsQuerySchema,
} from "@schemas/TransactionsQuery.schema";
import { dashboardError, dashboardOk } from "@utils/dashboardHandlerUtils";
import type { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { createAppContext } from "../appContext";

/**
 * GET /transactions
 * Returns the legacy recent-transactions payload with no query string,
 * or the paginated transaction log when timeframe/filter query params are present.
 */
export const getAllTransactionsHandler = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  const appContext = createAppContext({ lambdaRequest: event });
  const query = event.queryStringParameters ?? {};
  const hasSupportedQueryParam = TRANSACTIONS_QUERY_PARAM_KEYS.some(
    (queryKey) => query[queryKey] !== undefined,
  );

  try {
    if (hasSupportedQueryParam) {
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
