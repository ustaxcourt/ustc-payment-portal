import { UnauthorizedError } from "./errors/unauthorized";
import { getSecretString } from "./clients/secretsClient";
import { ServerError } from "./errors/serverError";

type Headers = { [key: string]: string | string[] | undefined };

let cachedToken: string | undefined;

export const authorizeRequest = async (headers?: Headers) => {
  if (!headers) {
    throw new UnauthorizedError("Missing Authentication");
  }

  let authentication: string = "empty";
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === "authentication") {
      authentication = headers[k] as string;
      break;
    }
  }

  if (!cachedToken) {
    const tokenSecretId = process.env.API_ACCESS_TOKEN_SECRET_ID;
    if (!tokenSecretId) {
      throw new UnauthorizedError("Unauthorized");
    }
    try {
      console.log('Attempting to fetch secret from Secrets Manager...');
      cachedToken = await getSecretString(tokenSecretId);
      console.log('Successfully fetched secret, length:', cachedToken?.length);
    } catch (error) {
      console.error(
        "Failed to fetch API access token from Secrets Manager",
        error
      );
      console.error('Error details:', {
        name: (error as any)?.name,
        message: (error as any)?.message,
        code: (error as any)?.code,
        statusCode: (error as any)?.statusCode
      });
      throw new ServerError("Failed to fetch API access token from Secrets Manager");
    }
  }

  const expected = `Bearer ${cachedToken}`;
  const received = (authentication ?? '');

  if (received !== expected) {
    console.warn("Invalid Token");
    throw new UnauthorizedError("Unauthorized");
  }
};
