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

export const initPaymentHandler = (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> => {
  if (!event.body) {
    return Promise.resolve(handleError(new InvalidRequestError("missing body")));
  }

  const request = JSON.parse(event.body);

  if (!request.feeId) {
    return Promise.resolve(
      handleError(new InvalidRequestError("missing feeId"))
    );
  }

  return lambdaHandler(
    request,
    event.requestContext,
    appContext.getUseCases().initPayment,
    request.feeId,
    true // inject clientName for initPayment
  );
};

export const processPaymentHandler = (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> => {
  if (!event.body) {
    return Promise.resolve(handleError(new InvalidRequestError("missing body")));
  }

  const request = JSON.parse(event.body);

  return lambdaHandler(
    request,
    event.requestContext,
    appContext.getUseCases().processPayment,
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
