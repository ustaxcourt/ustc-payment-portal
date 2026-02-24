import {
  APIGatewayProxyResult,
  APIGatewayEvent,
  APIGatewayEventRequestContext,
} from "aws-lambda";
import { createAppContext } from "./appContext";
import { authorizeRequest } from "./authorizeRequest";
import { authorizeAppId } from "./authorizeAppId";
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
  callback: LambdaHandler
): Promise<APIGatewayProxyResult> => {
  try {
    const roleArn = authorizeRequest(requestContext);
    await authorizeAppId(roleArn, request.appId);
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
    throw new InvalidRequestError("missing body");
  }

  const request = JSON.parse(event.body);

  return lambdaHandler(
    request,
    event.requestContext,
    appContext.getUseCases().initPayment
  );
};

export const processPaymentHandler = (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> => {
  if (!event.body) {
    throw new InvalidRequestError("missing body");
  }

  const request = JSON.parse(event.body);

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
    throw new InvalidRequestError("missing required information");
  }

  return lambdaHandler(
    event.pathParameters,
    event.requestContext,
    appContext.getUseCases().getDetails
  );
};
