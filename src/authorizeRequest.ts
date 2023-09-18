import { UnauthorizedError } from "./errors/unauthorized";

type Headers = { [key: string]: string | string[] | undefined };

export const authorizeRequest = (headers?: Headers) => {
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

  if (authentication !== `Bearer ${process.env.API_ACCESS_TOKEN}`) {
    throw new UnauthorizedError("Unauthorized");
  }
};
