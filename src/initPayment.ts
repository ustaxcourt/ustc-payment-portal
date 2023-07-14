import { APIGatewayProxyResult, APIGatewayEvent } from "aws-lambda";
import { createAppContext } from "./appContext";
import { InitPaymentRequest } from "./types/InitPaymentRequest";
import { handleError } from "./handleError";
import { authorizeRequest } from "./authorizeRequest";

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

    const request = JSON.parse(event.body) as InitPaymentRequest;

    authorizeRequest(request);

    const result = await appContext
      .getUseCases()
      .initPayment(appContext, JSON.parse(event.body));
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (err) {
    return handleError(err);
  }
};
