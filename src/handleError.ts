import { ZodError } from "zod";
import { PayGovError } from "./errors/payGovError";
import { logger } from "./utils/logger";

type ErrorLogger = Pick<typeof logger, "error">;

export const handleError = (err: any, errorLogger: ErrorLogger = logger) => {
  errorLogger.error({ err }, "responding with an error");
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
  }
  return {
    statusCode: 500,
    body: JSON.stringify({
      message: "An unexpected error occurred while processing the request",
      errors: [],
    }),
  };
};
