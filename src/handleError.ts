import { ZodError } from "zod";
import { PayGovError } from "./errors/payGovError";
import { ServerError } from "./errors/serverError";
import { logger } from "./utils/getPortalLogger";

export const handleError = (err: any) => {
  logger.error("responding with an error", { err });
  if (err.statusCode && err.statusCode < 500) {
    return {
      statusCode: err.statusCode,
      body: JSON.stringify({
        message: err.message,
        errors: [],
      }),
    };
  } else if (err instanceof ZodError) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Validation error",
        errors: err.issues,
      }),
    };
  } else if (err instanceof PayGovError) {
    return {
      statusCode: err.statusCode,
      body: JSON.stringify({
        message: err.message,
        errors: [],
      }),
    };
  } else if (err instanceof ServerError) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: err.message,
        errors: [],
      }),
    };
  }
  // DEFAULT: Handles the generic Error type.
  return {
    statusCode: 500,
    body: JSON.stringify({
      message: "An unexpected error occurred while processing the request",
      errors: [],
    }),
  };
};
