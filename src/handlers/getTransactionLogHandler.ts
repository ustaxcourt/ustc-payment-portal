import { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { createAppContext } from "../appContext";
import { TransactionLogQuerySchema } from "@schemas/TransactionLog.schema";
import { dashboardOk, dashboardError } from "@utils/dashboardHandlerUtils";

/**
 * GET /transaction-log
 * Transaction log for a timeframe, defaulting to the current Court day.
 *
 * Separate from /transactions, which serves the dev dashboard on a different
 * contract and must keep its response shape.
 */
export const getTransactionLogHandler = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  const appContext = createAppContext({ lambdaRequest: event });

  const query = TransactionLogQuerySchema.safeParse(
    event.queryStringParameters ?? {},
  );
  if (!query.success) {
    return dashboardError(400, query.error.issues[0].message);
  }

  try {
    const result = await appContext
      .getUseCases()
      .getTransactionLog(appContext, query.data);
    return dashboardOk(result);
  } catch (err) {
    console.error("[Dashboard] getTransactionLog error:", err);
    return dashboardError(500, "Internal server error");
  }
};
