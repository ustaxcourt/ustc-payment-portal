import { APIGatewayProxyResult, APIGatewayEvent } from "aws-lambda";
import { ZodType } from "zod";
import { createAppContext } from "../appContext";
import { extractCallerArn } from "../extractCallerArn";
import { handleError } from "../handleError";
import { ClientPermission } from "../types/ClientPermission";
import { AppContext } from "../types/AppContext";
import { isValidPaymentStatus } from "../useCases/getTransactionsByStatus";
import { PaymentStatusSchema } from "../schemas/PaymentStatus.schema";
import { getClientByRoleArn } from "../clients/permissionsClient";
import { parseAndValidate } from "../utils/parseAndValidate";

type LambdaHandler<T> = (
  appContext: AppContext,
  params: { client: ClientPermission; request: T },
) => Promise<unknown>;

export const lambdaHandler = async <T>({
  schema,
  event,
  rawRequest,
  callback,
}: {
  schema: ZodType<T>;
  event: APIGatewayEvent;
  rawRequest: string;
  callback: LambdaHandler<T>;
}): Promise<APIGatewayProxyResult> => {
  const appContext = createAppContext({ lambdaRequest: event });
  try {
    const parsedRequest = parseAndValidate(rawRequest, schema);
    const roleArn = extractCallerArn(event.requestContext);
    const client = await getClientByRoleArn(roleArn);
    const result = await callback(appContext, {
      client,
      request: parsedRequest.value,
    });
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (err) {
    return handleError(appContext, err);
  }
};

// ──────────────────────────────
// Dashboard Lambda Handlers
// NOTE: If we write integration tests for these handlers, we will need to setup PR ephemeral environments to spin up a RDS instance, otherwise the tests will always fail.
// ──────────────────────────────
const getDashboardCorsHeaders = () => {
  const origin = process.env.DASHBOARD_ALLOWED_ORIGIN;
  if (!origin) {
    throw new Error("DASHBOARD_ALLOWED_ORIGIN env var is required but not set");
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
};

const dashboardOk = (body: unknown): APIGatewayProxyResult => ({
  statusCode: 200,
  headers: { "Content-Type": "application/json", ...getDashboardCorsHeaders() },
  body: JSON.stringify(body),
});

const dashboardError = (
  statusCode: number,
  message: string,
): APIGatewayProxyResult => ({
  statusCode,
  headers: { "Content-Type": "application/json", ...getDashboardCorsHeaders() },
  body: JSON.stringify({ message }),
});

/**
 * GET /transactions
 * Returns the 100 most recent transactions across all statuses.
 */
export const getAllTransactionsHandler = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  const appContext = createAppContext({
    lambdaRequest: event,
  });
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

/**
 * GET /transactions/{paymentStatus}
 * Returns up to 100 transactions filtered by payment status.
 */
export const getTransactionsByStatusHandler = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  const appContext = createAppContext({
    lambdaRequest: event,
  });
  const paymentStatus = event.pathParameters?.paymentStatus;
  if (!paymentStatus) {
    return dashboardError(
      400,
      "Missing required path parameter: paymentStatus",
    );
  }
  if (!isValidPaymentStatus(paymentStatus)) {
    return dashboardError(
      400,
      `Invalid paymentStatus. Expected one of: ${PaymentStatusSchema.options.join(
        ", ",
      )}`,
    );
  }
  try {
    const result = await appContext
      .getUseCases()
      .getTransactionsByStatus(appContext, {
        paymentStatus: paymentStatus as "pending" | "success" | "failed",
      });
    return dashboardOk(result);
  } catch (err) {
    console.error("[Dashboard] getTransactionsByStatus error:", err);
    return dashboardError(500, "Internal server error");
  }
};

/**
 * GET /transaction-payment-status
 * Returns aggregated counts per payment status.
 */
export const getTransactionPaymentStatusHandler = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  const appContext = createAppContext({
    lambdaRequest: event,
  });
  try {
    const result = await appContext
      .getUseCases()
      .getTransactionPaymentStatus(appContext);
    return dashboardOk(result);
  } catch (err) {
    console.error("[Dashboard] getTransactionPaymentStatus error:", err);
    return dashboardError(500, "Internal server error");
  }
};
