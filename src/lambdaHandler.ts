import {
  APIGatewayProxyResult,
  APIGatewayEvent,
  APIGatewayEventRequestContext,
} from "aws-lambda";
import { createAppContext } from "./appContext";
import { extractCallerArn } from "./extractCallerArn";
import { authorizeClient } from "./authorizeClient";
import { handleError } from "./handleError";
import { InvalidRequestError } from "./errors/invalidRequest";
import { InitPaymentRequestSchema } from "./schemas/InitPayment.schema";
import { GetDetails } from "./useCases/getDetails";
import { InitPayment } from "./useCases/initPayment";
import { ProcessPayment } from "./useCases/processPayment";
import { isValidPaymentStatus } from "./useCases/getTransactionsByStatus";
import { PaymentStatusSchema } from "./schemas/PaymentStatus.schema";

const appContext = createAppContext();

type LambdaHandler = ProcessPayment | InitPayment | GetDetails;

const lambdaHandler = async (
  request: any,
  requestContext: APIGatewayEventRequestContext,
  callback: LambdaHandler,
  feeId?: string,
  injectClientName?: boolean
): Promise<APIGatewayProxyResult> => {
  try {
    const roleArn = extractCallerArn(requestContext);
    const client = await authorizeClient(roleArn, feeId);
    // For initPayment, inject clientName into the request
    if (injectClientName && client && typeof request === 'object') {
      request.clientName = client.clientName;
    }
    const result = await callback(appContext, request);
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (err) {
    return handleError(err);
  }
};


const safeJsonParse = <T = any>(
  body: string | null | undefined
): { value?: T; error?: APIGatewayProxyResult } => {
  if (!body) {
    return { error: handleError(new InvalidRequestError("missing body")) };
  }

  try {
    return { value: JSON.parse(body) };
  } catch {
    return {
      error: handleError(
        new InvalidRequestError("invalid JSON in request body")
      ),
    };
  }
};

export const initPaymentHandler = (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> => {
  const { value: rawBody, error } = safeJsonParse(event.body);
  if (error) return Promise.resolve(error);

  const parsed = InitPaymentRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Promise.resolve(
      handleError(new InvalidRequestError(
        parsed.error.issues.map((i) => i.message).join(", ")
      ))
    );
  }

  return lambdaHandler(
    parsed.data,
    event.requestContext,
    appContext.getUseCases().initPayment,
    parsed.data.feeId,
    true // inject clientName for initPayment
  );
};

export const processPaymentHandler = (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> => {
  const { value: request, error } = safeJsonParse(event.body);
  if (error) return Promise.resolve(error);

  return lambdaHandler(
    request,
    event.requestContext,
    appContext.getUseCases().processPayment
  );
};


export const getDetailsHandler = (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> => {
  if (!event.pathParameters) {
    return Promise.resolve(
      handleError(new InvalidRequestError("missing required information"))
    );
  }
  // getDetails is a read-only lookup — no feeId required, IAM registration check is sufficient.
  return lambdaHandler(
    event.pathParameters,
    event.requestContext,
    appContext.getUseCases().getDetails
  );
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

const dashboardError = (statusCode: number, message: string): APIGatewayProxyResult => ({
  statusCode,
  headers: { "Content-Type": "application/json", ...getDashboardCorsHeaders() },
  body: JSON.stringify({ message }),
});

/**
 * GET /transactions
 * Returns the 100 most recent transactions across all statuses.
 */
export const getAllTransactionsHandler = async (): Promise<APIGatewayProxyResult> => {
  try {
    const result = await appContext.getUseCases().getRecentTransactions(appContext);
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
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> => {
  const paymentStatus = event.pathParameters?.paymentStatus;
  if (!paymentStatus) {
    return dashboardError(400, "Missing required path parameter: paymentStatus");
  }
  if (!isValidPaymentStatus(paymentStatus)) {
    return dashboardError(400, `Invalid paymentStatus. Expected one of: ${PaymentStatusSchema.options.join(", ")}`);
  }
  try {
    const result = await appContext.getUseCases().getTransactionsByStatus(
      appContext,
      { paymentStatus: paymentStatus as "pending" | "success" | "failed" }
    );
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
export const getTransactionPaymentStatusHandler = async (): Promise<APIGatewayProxyResult> => {
  try {
    const result = await appContext.getUseCases().getTransactionPaymentStatus(appContext);
    return dashboardOk(result);
  } catch (err) {
    console.error("[Dashboard] getTransactionPaymentStatus error:", err);
    return dashboardError(500, "Internal server error");
  }
};
