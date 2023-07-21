import { APIGatewayProxyResult, APIGatewayEvent } from "aws-lambda";
import { createAppContext } from "./appContext";
import { authorizeRequest } from "./authorizeRequest";
import { handleError } from "./handleError";
import { InvalidRequestError } from "./errors/invalidRequest";

const appContext = createAppContext();

const lambdaHandler = async (
  event: APIGatewayEvent,
  callback: Function
): Promise<APIGatewayProxyResult> => {
  if (!event.body) {
    throw new InvalidRequestError("missing body");
  }

  try {
    const request = JSON.parse(event.body);
    authorizeRequest(request);
    const result = await callback(appContext, request);
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (err) {
    return handleError(err);
  }
};

export const initPaymentHandler = async (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> =>
  lambdaHandler(event, appContext.getUseCases().initPayment);

export const processPaymentHandler = async (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> =>
  lambdaHandler(event, appContext.getUseCases().processPayment);
