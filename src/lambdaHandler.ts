import { APIGatewayProxyResult, APIGatewayEvent } from "aws-lambda";
import { createAppContext } from "./appContext";
import { authorizeRequest } from "./authorizeRequest";
import { handleError } from "./handleError";
import { InvalidRequestError } from "./errors/invalidRequest";
import { GetDetails } from "./useCases/getDetails";
import { InitPayment } from "./useCases/initPayment";
import { ProcessPayment } from "./useCases/processPayment";

const appContext = createAppContext();

type LambdaHandler =
  | ProcessPayment
  | InitPayment
  | GetDetails;

const lambdaHandler = async (
  event: APIGatewayEvent,
  callback: LambdaHandler
): Promise<APIGatewayProxyResult> => {
  if (!event.body) {
    throw new InvalidRequestError("missing body");
  }

  try {
    const request = JSON.parse(event.body);
    authorizeRequest(event.headers);
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

export const getDetailsHandler = (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> =>
  lambdaHandler(event, appContext.getUseCases().getDetails);
