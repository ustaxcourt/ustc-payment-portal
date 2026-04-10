import {
  APIGatewayProxyResult,
  APIGatewayEvent,
  APIGatewayEventRequestContext,
} from "aws-lambda";
import { ZodType } from "zod";
import { createAppContext } from "./appContext";
import { extractCallerArn } from "./extractCallerArn";
import { authorizeClient } from "./authorizeClient";
import { handleError } from "./handleError";
import { InvalidRequestError } from "./errors/invalidRequest";
import { InitPaymentRequestSchema } from "./schemas/InitPayment.schema";
import { ProcessPaymentRequestSchema } from "./schemas/ProcessPayment.schema";
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
): Promise<APIGatewayProxyResult> => {
  try {
    const roleArn = extractCallerArn(requestContext);
    await authorizeClient(roleArn, feeId);
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

/**
 * Parses a JSON body and validates it against a Zod schema.
 * Returns either the typed, validated value or a pre-built 400 error response.
 */
const parseAndValidate = <T>(
  body: string | null | undefined,
  schema: ZodType<T>,
): { value?: T; error?: APIGatewayProxyResult } => {
  const parsed = safeJsonParse(body);
  if (parsed.error) return { error: parsed.error };

  const result = schema.safeParse(parsed.value);
  if (!result.success) {
    return { error: handleError(result.error) };
  }

  return { value: result.data };
};

export const initPaymentHandler = (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  const { value, error } = parseAndValidate(event.body, InitPaymentRequestSchema);
  if (error) return Promise.resolve(error);

  return lambdaHandler(
    value,
    event.requestContext,
    appContext.getUseCases().initPayment,
    value!.feeId,
  );
};

export const processPaymentHandler = (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  const { value, error } = parseAndValidate(
    event.body,
    ProcessPaymentRequestSchema,
  );
  if (error) return Promise.resolve(error);

  return lambdaHandler(
    value,
    event.requestContext,
    appContext.getUseCases().processPayment,
  );
};

export const getDetailsHandler = (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  if (!event.pathParameters) {
    return Promise.resolve(
      handleError(new InvalidRequestError("missing required information")),
    );
  }
  // getDetails is a read-only lookup — no feeId required, IAM registration check is sufficient.
  return lambdaHandler(
    event.pathParameters,
    event.requestContext,
    appContext.getUseCases().getDetails,
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
export const getAllTransactionsHandler =
  async (): Promise<APIGatewayProxyResult> => {
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
export const getTransactionPaymentStatusHandler =
  async (): Promise<APIGatewayProxyResult> => {
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
