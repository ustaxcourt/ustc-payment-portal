import { UnauthorizedError } from "./errors/unauthorized";
import { getSecretString } from "./clients/secretsClient";

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
      cachedToken = await getSecretString(tokenSecretId);
    } catch (error) {
      console.error(
        "Failed to fetch API access token from Secrets Manager:",
        error
      );
      throw new UnauthorizedError("Unauthorized");
    }
  }

  if (authentication !== `Bearer ${cachedToken}`) {
    throw new UnauthorizedError("Unauthorized");
  }
};
