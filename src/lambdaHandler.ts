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
