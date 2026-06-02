import { ZodError } from "zod";
import { PayGovError } from "./errors/payGovError";
import { ServerError } from "./errors/serverError";
import { logger } from "./utils/logger";

const computeResponse = (err: any) => {
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
  return {
    statusCode: 500,
    body: JSON.stringify({
      message: "An unexpected error occurred while processing the request",
      errors: [],
    }),
  };
};

export const handleError = (err: any) => {
  const response = computeResponse(err);
  const logPayload = {
    statusCode: response.statusCode,
    errorName: err instanceof Error ? err.name : undefined,
    errorMessage: err instanceof Error ? err.message : String(err),
  };

  // 5xx → error level fires the lambda_5xx alarm. 4xx → warn keeps logs without alerting.
  if (response.statusCode >= 500) {
    logger.error(logPayload, "Lambda handler returned a server error");
  } else {
    logger.warn(logPayload, "Lambda handler returned a client error");
  }
  return response;
};
