import fetch from "node-fetch";

import { APIGatewayProxyResult } from "aws-lambda";
import { createAppContext } from "./appContext";

export const handler = async (): Promise<APIGatewayProxyResult> => {
  try {
    const appContext = createAppContext();
    const httpsAgent = await appContext.getHttpsAgent();
    const result = await fetch(`${process.env.SOAP_URL}?wsdl`, {
      agent: httpsAgent,
    });

    console.log(result);
    const resultText = await result.text();

    return {
      statusCode: 200,
      body: resultText,
    };
  } catch (err) {
    console.log(err);
    return {
      statusCode: 500,
      body: "not ok",
    };
  }
};
