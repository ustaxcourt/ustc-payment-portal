import fetch from "node-fetch";

import { APIGatewayProxyResult } from "aws-lambda";
import { createAppContext } from "./appContext";
import { getSecretString } from "./clients/secretsClient";

export const handler = async (): Promise<APIGatewayProxyResult> => {
  try {
    const appContext = createAppContext();
    const httpsAgent = await appContext.getHttpsAgent();

    const headers: { Authorization?: string; Authentication?: string } = {};

    const tokenId = process.env.PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID;
    if (tokenId) {
      try {
        const token = await getSecretString(tokenId);
        headers.Authorization = `Bearer ${token}`;
        headers.Authentication = headers.Authorization;
      } catch {
        // Proceed without Authorization header if token fetch fails
      }
    }

    const result = await fetch(`${process.env.SOAP_URL}?wsdl`, {
      agent: httpsAgent,
      headers,
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
