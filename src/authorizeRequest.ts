import { ProcessPaymentRequest } from "./types/ProcessPaymentRequest";
import { UnauthorizedError } from "./errors/unauthorized";
import { InitPaymentRequest } from "./types/InitPaymentRequest";

export const authorizeRequest = (
  request: InitPaymentRequest | ProcessPaymentRequest
) => {
  if (!request.authToken || request.authToken != process.env.API_TOKEN) {
    console.error("unauthorized request", request);
    throw new UnauthorizedError();
  }
};
