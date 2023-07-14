import { Context, APIGatewayProxyResult, APIGatewayEvent } from "aws-lambda";
import { createAppContext } from "./appContext";
import { ValidationError } from 'joi'

const appContext = createAppContext();

export const handler = async (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "missing body",
        }),
      };
    }
    const result = await appContext
      .getUseCases()
      .initPayment(appContext, JSON.parse(event.body));
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (err) {
    if (err instanceof ValidationError) {
      return {
        statusCode: 400,
        body: JSON.stringify(err)
      }
    }
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "error!",
      }),
    };
  }
};
