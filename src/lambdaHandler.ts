import {
  APIGatewayProxyResult,
  APIGatewayEvent,
  APIGatewayProxyEventHeaders,
} from "aws-lambda";
import { createAppContext } from "./appContext";
import { authorizeRequest } from "./authorizeRequest";
import { handleError } from "./handleError";
import { InvalidRequestError } from "./errors/invalidRequest";
import { GetDetails } from "./useCases/getDetails";
import { InitPayment } from "./useCases/initPayment";
import { ProcessPayment } from "./useCases/processPayment";

const appContext = createAppContext();

type LambdaHandler = ProcessPayment | InitPayment | GetDetails;

const lambdaHandler = async (
  request: any,
  headers: APIGatewayProxyEventHeaders,
  callback: LambdaHandler
): Promise<APIGatewayProxyResult> => {
  try {
    authorizeRequest(headers);
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
    event.headers,
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
    event.headers,
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
    event.headers,
    appContext.getUseCases().getDetails
  );
};
