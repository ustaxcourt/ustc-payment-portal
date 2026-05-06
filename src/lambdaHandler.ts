import {
  APIGatewayProxyResult,
  APIGatewayEvent,
  APIGatewayEventRequestContext,
} from "aws-lambda";
import { ZodType } from "zod";
import { Logger } from "pino/pino";
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
import { Metadata, InitPaymentRequest } from "./schemas";

export const appContext = createAppContext();

type LambdaHandler<T> = (
  appContext: AppContext,
  params: {
    client: ClientPermission;
    request: T;
  },
) => Promise<unknown>;

const lambdaHandler = async <T>(
  request: T,
  requestContext: APIGatewayEventRequestContext,
  callback: LambdaHandler<T>,
  feeId?: string,
  requestLogger?: Logger,
): Promise<APIGatewayProxyResult> => {
  let clientScopedLogger: Logger | undefined;
  try {
    const roleArn = extractCallerArn(requestContext);
    const client = await authorizeClient(roleArn, feeId);
    clientScopedLogger =
      requestLogger?.child({
        clientName: client.clientName,
        clientArn: client.clientRoleArn,
      }) ??
      appContext.logger({
        clientName: client.clientName,
        clientArn: client.clientRoleArn,
      });
    clientScopedLogger.info("Authorized client for request");
    const result = await callback(appContext, {
      client,
      request,
    });
    clientScopedLogger.info("Completed request");
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (err) {
    return handleError(err, clientScopedLogger);
  }
};

type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: APIGatewayProxyResult };

const safeJsonParse = <T = any>(
  body: string | null | undefined,
  errorLogger?: Logger,
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
  errorLogger?: Logger,
): ParseResult<T> => {
  const parsed = safeJsonParse(body, errorLogger);
  if (!parsed.ok) return parsed;

  const result = schema.safeParse(parsed.value);
  if (!result.success) {
    return { ok: false, error: handleError(result.error, errorLogger) };
  }

  return { ok: true, value: result.data };
};

export const initPaymentHandler = (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  const requestLogger = appContext.logger({
    requestId: event.requestContext.requestId,
    path: event.path,
    httpMethod: event.httpMethod,
    logLevel: process.env.LOG_LEVEL,
  });
  requestLogger.debug("Received /init request");

  const result: ParseResult<InitPaymentRequest> = parseAndValidate(
    event.body,
    InitPaymentRequestSchema,
    requestLogger,
  );
  if (!result.ok) return Promise.resolve(result.error);

  // Extract metadata from the validated request, normalizing it to Record<string, unknown> or undefined
  const metadata: Metadata | undefined =
    result.value.metadata &&
    typeof result.value.metadata === "object" &&
    !Array.isArray(result.value.metadata)
      ? result.value.metadata
      : undefined;

  const enrichedLogger = requestLogger.child({
    feeId: result.value.feeId,
    transactionReferenceId: result.value.transactionReferenceId,
    metadata,
  });

  return lambdaHandler(
    result.value,
    event.requestContext,
    appContext.getUseCases().initPayment,
    result.value.feeId,
    enrichedLogger,
  );
};

export const processPaymentHandler = (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  const requestLogger = appContext.logger({
    requestId: event.requestContext.requestId,
    path: event.path,
    httpMethod: event.httpMethod,
    logLevel: process.env.LOG_LEVEL,
  });

  const result = parseAndValidate(
    event.body,
    ProcessPaymentRequestSchema,
    requestLogger,
  );
  if (!result.ok) return Promise.resolve(result.error);

  return lambdaHandler(
    result.value,
    event.requestContext,
    appContext.getUseCases().processPayment,
    undefined,
    requestLogger,
  );
};

export const getDetailsHandler = (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  const requestLogger = appContext.logger({
    requestId: event.requestContext.requestId,
    path: event.path,
    httpMethod: event.httpMethod,
    logLevel: process.env.LOG_LEVEL,
  });

  const result = GetDetailsPathParamsSchema.safeParse(
    event.pathParameters ?? {},
  );
  if (!result.success) {
    return Promise.resolve(
      handleError(
        new InvalidRequestError("Transaction Reference Id was invalid"),
        requestLogger,
      ),
    );
  }
  // getDetails is a read-only lookup - no feeId required, IAM registration check is sufficient.
  // Per-transaction client ownership is enforced inside the use case.
  return lambdaHandler(
    { transactionReferenceId: result.data.transactionReferenceId },
    event.requestContext,
    appContext.getUseCases().getDetails,
    undefined,
    requestLogger,
  );
};

// ------------------------------
// Dashboard Lambda Handlers
// NOTE: If we write integration tests for these handlers, we will need to setup PR ephemeral environments to spin up a RDS instance, otherwise the tests will always fail.
// ------------------------------
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
