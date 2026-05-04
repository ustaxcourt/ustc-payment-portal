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
import { GetDetailsPathParamsSchema } from "./schemas/GetDetails.schema";
import { ClientPermission } from "./types/ClientPermission";
import { AppContext } from "./types/AppContext";
import { isValidPaymentStatus } from "./useCases/getTransactionsByStatus";
import { PaymentStatusSchema } from "./schemas/PaymentStatus.schema";
import { createRequestLogger } from "./utils/logger";

const appContext = createAppContext();

type LambdaHandler<T> = (
  appContext: AppContext,
  params: {
    client: ClientPermission;
    request: T;
    requestLogger?: ReturnType<typeof createRequestLogger>;
  },
) => Promise<unknown>;

const lambdaHandler = async <T>(
  request: T,
  requestContext: APIGatewayEventRequestContext,
  callback: LambdaHandler<T>,
  feeId?: string,
  requestLogger?: ReturnType<typeof createRequestLogger>,
): Promise<APIGatewayProxyResult> => {
  try {
    const roleArn = extractCallerArn(requestContext);
    const client = await authorizeClient(roleArn, feeId);
    const scopedLogger = requestLogger?.child({
      clientName: client.clientName,
      clientArn: client.clientRoleArn,
    });
    scopedLogger?.info("Authorized client for request");
    const result = await callback(appContext, {
      client,
      request,
      requestLogger,
    });
    scopedLogger?.info("Completed request");
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (err) {
    requestLogger?.error({ err }, "Failed request");
    return handleError(err);
  }
};

type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: APIGatewayProxyResult };

const safeJsonParse = <T = any>(
  body: string | null | undefined,
): ParseResult<T> => {
  if (!body) {
    const error = handleError(new InvalidRequestError("missing body"));
    return { ok: false, error };
  }

  try {
    return { ok: true, value: JSON.parse(body) };
  } catch {
    return {
      ok: false,
      error: handleError(
        new InvalidRequestError("invalid JSON in request body"),
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
): ParseResult<T> => {
  const parsed = safeJsonParse(body);
  if (!parsed.ok) return parsed;

  const result = schema.safeParse(parsed.value);
  if (!result.success) {
    return { ok: false, error: handleError(result.error) };
  }

  return { ok: true, value: result.data };
};

export const initPaymentHandler = (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  const result = parseAndValidate(event.body, InitPaymentRequestSchema);
  if (!result.ok) return Promise.resolve(result.error);

  const metadata =
    result.value.metadata &&
    typeof result.value.metadata === "object" &&
    !Array.isArray(result.value.metadata)
      ? result.value.metadata
      : undefined;

  const requestLogger = createRequestLogger({
    awsRequestId: event.requestContext.requestId,
    path: event.path,
    httpMethod: event.httpMethod,
    feeId: result.value.feeId,
    transactionReferenceId: result.value.transactionReferenceId,
    metadata,
    ...(metadata ?? {}),
  });
  requestLogger?.debug("Received /init request");

  return lambdaHandler(
    result.value,
    event.requestContext,
    appContext.getUseCases().initPayment,
    result.value.feeId,
    requestLogger,
  );
};

export const processPaymentHandler = (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  const result = parseAndValidate(event.body, ProcessPaymentRequestSchema);
  if (!result.ok) return Promise.resolve(result.error);

  return lambdaHandler(
    result.value,
    event.requestContext,
    appContext.getUseCases().processPayment,
  );
};

export const getDetailsHandler = (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  const result = GetDetailsPathParamsSchema.safeParse(
    event.pathParameters ?? {},
  );
  if (!result.success) {
    return Promise.resolve(
      handleError(
        new InvalidRequestError("Transaction Reference Id was invalid"),
      ),
    );
  }
  // getDetails is a read-only lookup — no feeId required, IAM registration check is sufficient.
  // Per-transaction client ownership is enforced inside the use case.
  return lambdaHandler(
    { transactionReferenceId: result.data.transactionReferenceId },
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
