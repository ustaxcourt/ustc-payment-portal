import { ZodError } from "zod";
import { PayGovError } from "./errors/payGovError";

// Wildcard origin is intentional: this API is called by IAM SigV4-authenticated Lambda clients,
// not browsers with cookies, so a wildcard does not introduce CSRF or credential-leakage risk.
// Dashboard handlers use a separate, configurable origin — see getDashboardCorsHeaders in lambdaHandler.ts.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const buildResponse = (
  statusCode: number,
  body: { message: string; errors: unknown[] }
) => ({
  statusCode,
  headers: corsHeaders,
  body: JSON.stringify(body),
});

export const handleError = (err: unknown) => {
  console.error(`responding with an error`, err);

  if (err instanceof PayGovError) {
    return buildResponse(504, {
      message: err.message,
      errors: [],
    });
  }

  if (
    err &&
    typeof err === "object" &&
    "statusCode" in err &&
    typeof (err as { statusCode: number }).statusCode === "number" &&
    (err as { statusCode: number }).statusCode < 500
  ) {
    const typedErr = err as { statusCode: number; message: string };
    return buildResponse(typedErr.statusCode, {
      message: typedErr.message,
      errors: [],
    });
  }

  if (err instanceof ZodError) {
    return buildResponse(400, {
      message: "Validation error",
      errors: err.issues,
    });
  }

  return buildResponse(500, {
    message: "An unexpected error occurred",
    errors: [],
  });
};
