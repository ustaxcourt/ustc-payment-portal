import type { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { createAppContext } from "../appContext";
import { TransactionLogQuerySchema } from "@schemas/TransactionLog.schema";
import {
  dashboardOk,
  dashboardError,
  dashboardValidationError,
} from "@utils/dashboardHandlerUtils";
import knex from "@/db/knex";

/** GET /transaction-log — timeframe defaults to the current Court day.
 *  Separate from /transactions, which the dev dashboard depends on. */
export const getTransactionLogHandler = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  const appContext = createAppContext({ lambdaRequest: event });
  if (knex) {
    const [{ db, usr }] = (
      await knex.raw("select current_database() as db, current_user as usr")
    ).rows;
    appContext.logger.info("db usr", { db, usr });
  }

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
    appContext.logger.error("getTransactionLog failed", {
      errorName: err instanceof Error ? err.name : undefined,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return dashboardError(500, "Internal server error");
  }
};
