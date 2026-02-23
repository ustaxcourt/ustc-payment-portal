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
      "Error message for invalid requests. May be plain text (e.g., 'missing body') " +
      "or a JSON-stringified validation error object.",
    example: "missing body",
  })
  .openapi("BadRequestError");

export const ForbiddenErrorSchema = z
  .string()
  .openapi({
    description: "Plain text error message for authentication/authorization failures",
    example: "Missing Authentication",
  })
  .openapi("ForbiddenError");

export const ServerErrorSchema = z
  .string()
  .openapi({
    description: "Plain text error message for internal server errors",
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
