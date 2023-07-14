import { APIGatewayProxyResult, APIGatewayEvent } from "aws-lambda";
import { createAppContext } from "./appContext";
import { ProcessPaymentRequest } from "./types/ProcessPaymentRequest";
import { authorizeRequest } from "./authorizeRequest";
import { handleError } from "./handleError";

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

    const request = JSON.parse(event.body) as ProcessPaymentRequest;

    authorizeRequest(request);

    const result = await appContext
      .getUseCases()
      .processPayment(appContext, request);
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (err) {
    return handleError(err);
  }
};
