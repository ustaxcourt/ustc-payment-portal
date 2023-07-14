import { APIGatewayProxyResult, APIGatewayEvent } from "aws-lambda";
import { createAppContext } from "./appContext";
import { ValidationError } from "joi";
import { AppContext } from "./types/AppContext";

const appContext = createAppContext();

const lambdaHandler = async (
  event: APIGatewayEvent,
  callback: any
): Promise<APIGatewayProxyResult> => {
  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "missing body",
      }),
    };
  }

  try {
    const payload = JSON.parse(event.body);
    const result = await callback(appContext, payload);
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (err) {
    if (err instanceof ValidationError) {
      return {
        statusCode: 400,
        body: JSON.stringify(err),
      };
    }
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "internal server error",
      }),
    };
  }
};

export const initPaymentHandler = async (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> => {
  return lambdaHandler(event, appContext.getUseCases().initPayment);
};

export const processPaymentHandler = async (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> => {
  return lambdaHandler(event, appContext.getUseCases().processPayment);
};
