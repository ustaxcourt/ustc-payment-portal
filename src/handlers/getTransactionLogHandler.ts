import { TransactionLogQuerySchema } from "@schemas/TransactionLog.schema";
import {
  dashboardError,
  dashboardOk,
  dashboardValidationError,
} from "@utils/dashboardHandlerUtils";
import { logError } from "@utils/logError";
import type { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { createAppContext } from "../appContext";

/** GET /transaction-log — timeframe defaults to the current Court day.
 *  Separate from /transactions, which the dev dashboard depends on. */
export const getTransactionLogHandler = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  const appContext = createAppContext({ lambdaRequest: event });

  const query = TransactionLogQuerySchema.safeParse(
    event.queryStringParameters ?? {},
  );
  if (!query.success) {
    return dashboardValidationError(query.error.issues);
  }

  try {
    const result = await appContext
      .getUseCases()
      .getTransactionLog(appContext, query.data);
    return dashboardOk(result);
  } catch (err) {
    logError(appContext, "getTransactionLog failed", err);
    return dashboardError(500, "Internal server error");
  }
};
