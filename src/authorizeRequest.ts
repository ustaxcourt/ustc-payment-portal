import { ProcessPaymentRequestRaw } from "./types/ProcessPaymentRequest";
import { InitPaymentRequestRaw } from "./types/InitPaymentRequest";
import { UnauthorizedError } from "./errors/unauthorized";

export const authorizeRequest = (
  request: InitPaymentRequestRaw | ProcessPaymentRequestRaw
) => {
  if (!request.authToken || request.authToken != process.env.API_TOKEN) {
    throw new UnauthorizedError();
  }
};
