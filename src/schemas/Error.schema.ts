import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

const ErrorDetailSchema = z.object({}).catchall(z.unknown()).openapi({
  description: "A structured error detail object (for example a Zod validation issue)",
  example: {
    code: "invalid_type",
    expected: "string",
    received: "undefined",
    path: ["urlSuccess"],
    message: "Required",
  },
});

const JsonErrorSchema = z.object({
  message: z.string().openapi({
    description: "Human-readable error summary",
    example: "An unexpected error occurred while processing the request",
  }),
  errors: z.array(ErrorDetailSchema).openapi({
    description: "Additional error details",
    example: [],
  }),
});

export const BadRequestErrorSchema = z
  .object(JsonErrorSchema.shape)
  .openapi({
    description:
      "JSON error response for invalid requests (HTTP 400).\n\n" +
      "Common error scenarios:\n" +
      "- Missing required fields\n" +
      "- Invalid field values\n" +
      "- Schema validation failures\n" +
      "- Fee not found\n" +
      "- Missing amount for variable fees",
    example: {
      message: "Validation error",
      errors: [
        {
          code: "invalid_type",
          expected: "string",
          received: "undefined",
          path: ["urlSuccess"],
          message: "Required",
        },
      ],
    },
  })
  .openapi("BadRequestError");

export const ForbiddenErrorSchema = z
  .object(JsonErrorSchema.shape)
  .openapi({
    description:
      "JSON error response for authentication/authorization failures (HTTP 403).\n\n" +
      "Common error scenarios:\n" +
      "- Missing API key\n" +
      "- Invalid API key\n" +
      "- Unauthorized fee access: Client not authorized to charge the requested fee",
    example: {
      message: "Missing Authentication",
      errors: [],
    },
  })
  .openapi("ForbiddenError");

export const ServerErrorSchema = z
  .object(JsonErrorSchema.shape)
  .openapi({
    description:
      "JSON error response for internal server errors (HTTP 500).\n\n" +
      "Returned when an unexpected error occurs during request processing. " +
      "If this error persists, contact support with the request details.",
    example: {
      message: "An unexpected error occurred while processing the request",
      errors: [],
    },
  })
  .openapi("ServerError");

export const GatewayErrorSchema = z
  .object(JsonErrorSchema.shape)
  .openapi({
    description:
      "JSON error response for Pay.gov communication failures (HTTP 504). " +
      "Returned when the API cannot receive a timely response from Pay.gov.",
    example: {
      message: "Error communicating with Pay.gov",
      errors: [],
    },
  })
  .openapi("GatewayError");

// Generic error schema (for backward compatibility)
export const ErrorResponseSchema = z
  .object(JsonErrorSchema.shape)
  .openapi({
    description: "Generic JSON error response",
    example: {
      message: "Invalid Request",
      errors: [],
    },
  })
  .openapi("ErrorResponse");
