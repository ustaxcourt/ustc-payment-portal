import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

// ============================================
// Init Payment (OpenAPI documentation schema - future API contract)
// ============================================
export const InitPaymentRequestSchema = z
  .object({
    appId: z.string().openapi({
      description: "The application ID",
      example: "DAWSON",
    }),
    transactionReferenceId: z.string().uuid().openapi({
      description: "Unique UUID for the transaction reference",
      example: "550e8400-e29b-41d4-a716-446655440000",
    }),
    urlSuccess: z.string().url().openapi({
      description: "URL to redirect to after successful payment",
      example: "https://client.app/success",
    }),
    urlCancel: z.string().url().openapi({
      description: "URL to redirect to if payment is cancelled",
      example: "https://client.app/cancel",
    }),
    metadata: z
      .object({
        docketNumber: z.string().openapi({
          description: "The docket number for the case",
          example: "123456",
        }),
        petitionNumber: z.string().openapi({
          description: "The petition number",
          example: "PET-7890",
        }),
      })
      .openapi({
        description: "Additional metadata for the payment",
      }),
  })
  .openapi("InitPaymentRequest");

export type InitPaymentRequest = z.infer<typeof InitPaymentRequestSchema>;

export const InitPaymentResponseSchema = z
  .object({
    token: z.string().openapi({
      description: "Payment token for the initiated transaction",
      example: "abc123token",
    }),
    paymentRedirect: z.string().url().openapi({
      description: "URL to redirect the user to complete payment on Pay.gov",
      example: "https://pay.gov/payment?token=abc123token&tcsAppID=USTC_APP",
    }),
  })
  .openapi("InitPaymentResponse");

export type InitPaymentResponse = z.infer<typeof InitPaymentResponseSchema>;

// ============================================
// Error Response
// ============================================
export const ErrorResponseSchema = z
  .object({
    statusCode: z.number().openapi({
      description: "HTTP status code",
      example: 400,
    }),
    message: z.string().openapi({
      description: "Error message",
      example: "Invalid request payload",
    }),
  })
  .openapi("ErrorResponse");
