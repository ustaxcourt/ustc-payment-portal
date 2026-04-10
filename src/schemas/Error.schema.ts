import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

// Note: The actual error response body is a plain string,
// not a JSON object. The HTTP status code is in the response header.
// For validation errors, the body is a JSON-stringified validation error object.

export const BadRequestErrorSchema = z
  .string()
  .openapi({
    description:
      "Error message for invalid requests (HTTP 400). May be plain text (e.g., 'missing body') " +
      "or a JSON-stringified validation error object.\n\n" +
      "Common error scenarios:\n" +
      "- Missing required fields: 'missing body'\n" +
      "- Invalid field values: 'invalid feeId'\n" +
      "- Schema validation failures: JSON-stringified validation error\n" +
      "- Fee not found: 'Fee type is not available'\n" +
      "- Missing amount for variable fees: 'Amount is required for variable fees'",
    example: "missing body",
  })
  .openapi("BadRequestError");

export const ForbiddenErrorSchema = z
  .string()
  .openapi({
    description:
      "Plain text error message for authentication/authorization failures (HTTP 403).\n\n" +
      "Common error scenarios:\n" +
      "- Missing API key: 'Missing Authentication'\n" +
      "- Invalid API key: 'Invalid API key'\n" +
      "- Unauthorized fee access: Client not authorized to charge the requested fee",
    example: "Missing Authentication",
  })
  .openapi("ForbiddenError");

export const ServerErrorSchema = z
  .string()
  .openapi({
    description:
      "Plain text error message for internal server errors (HTTP 500).\n\n" +
      "Returned when an unexpected error occurs during request processing. " +
      "If this error persists, contact support with the request details.",
    example: "Internal Server Error",
  })
  .openapi("ServerError");

// Generic error schema (for backward compatibility)
export const ErrorResponseSchema = z
  .string()
  .openapi({
    description: "Plain text error message",
    example: "Invalid Request",
  })
  .openapi("ErrorResponse");

// JSON error envelope returned by handleError for validation failures and
// thrown errors: `{ message, errors }`. Used for endpoints that run Zod
// schema validation at the edge (e.g. POST /process).
export const ValidationErrorResponseSchema = z
  .object({
    message: z.string().openapi({
      description:
        "Human-readable summary. 'Validation error' for Zod failures; otherwise the thrown error's message (e.g. 'missing body', 'invalid JSON in request body').",
      example: "Validation error",
    }),
    errors: z
      .array(z.any())
      .openapi({
        description:
          "Structured issue list. For Zod failures this contains ZodIssue objects with `path`, `message`, and `code`. Empty array for non-Zod errors.",
        example: [
          {
            code: "invalid_type",
            path: ["token"],
            message: "Required",
          },
        ],
      }),
  })
  .openapi("ValidationErrorResponse");
