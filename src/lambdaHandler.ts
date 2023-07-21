import { APIGatewayProxyResult, APIGatewayEvent } from "aws-lambda";
import { createAppContext } from "./appContext";
import { authorizeRequest } from "./authorizeRequest";
import { handleError } from "./handleError";
import { InvalidRequestError } from "./errors/invalidRequest";
import { AppContext } from "./types/AppContext";
import { InitPaymentRequest } from "./types/InitPaymentRequest";
import { ProcessPaymentRequest } from "./types/ProcessPaymentRequest";
import { InitPaymentResponse } from "./types/InitPaymentResponse";
import { ProcessPaymentResponse } from "./types/ProcessPaymentResponse";

const appContext = createAppContext();

type InitPaymentHandler = (
  appContext: AppContext,
  request: InitPaymentRequest
) => Promise<InitPaymentResponse>;

type ProcessPaymentHandler = (
  appContext: AppContext,
  request: ProcessPaymentRequest
) => Promise<ProcessPaymentResponse>;

type LambdaHandler = ProcessPaymentHandler | InitPaymentHandler;

const lambdaHandler = async (
  event: APIGatewayEvent,
  callback: LambdaHandler
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

export const initPaymentHandler = (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> =>
  lambdaHandler(event, appContext.getUseCases().initPayment);

export const processPaymentHandler = (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> =>
  lambdaHandler(event, appContext.getUseCases().processPayment);
