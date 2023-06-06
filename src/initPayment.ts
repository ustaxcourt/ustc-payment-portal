import { Context, APIGatewayProxyResult, APIGatewayEvent } from "aws-lambda";

import { createAppContext } from "./appContext";

// const appContext = createAppContext();

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
    console.log("what is happening");
    const result = {
      token: "asdf123",
    };
    // const result = await appContext
    //   .getUseCases()
    //   .initPayment(appContext, JSON.parse(event.body));
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "error!",
      }),
    };
  }
};
