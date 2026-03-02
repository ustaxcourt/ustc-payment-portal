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
  feeId?: string
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

export const initPaymentHandler = (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> => {
  if (!event.body) {
    return Promise.resolve(handleError(new InvalidRequestError("missing body")));
  }

  const request = JSON.parse(event.body);

  if (!request.feeId) {
    return Promise.resolve(handleError(new InvalidRequestError("feeid is required for payment initialization")));
  }

  return lambdaHandler(
    request,
    event.requestContext,
    appContext.getUseCases().initPayment,
    request.feeId
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

  // No feeId for read-only endpoint — IAM registration check is sufficient.
  return lambdaHandler(
    event.pathParameters,
    event.requestContext,
    appContext.getUseCases().getDetails
  );
};
