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
    feeId: z.string().openapi({
      description: "The fee ID for the payment",
      example: "FEE-12345",
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
// Get Details (GET /details/:appId/:transactionReferenceId)
// ============================================
export const TransactionStatusSchema = z
  .enum(["Success", "Failed", "Pending"])
  .openapi({
    description: "The status of the payment transaction",
    example: "Success",
  });

export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;

export const TransactionRecordSchema = z
  .object({
    payGovTrackingId: z.string().openapi({
      description: "Pay.gov tracking ID for the transaction",
      example: "TRK-123456789",
    }),
    transactionStatus: TransactionStatusSchema,
    paymentType: z.string().optional().openapi({
      description: "Type of payment (e.g., card, ACH)",
      example: "card",
    }),
    returnCode: z.string().optional().openapi({
      description: "Return code from Pay.gov",
      example: "0000",
    }),
    returnDetail: z.string().optional().openapi({
      description: "Detailed return message from Pay.gov",
      example: "Transaction completed successfully",
    }),
    createdTimestamp: z.string().datetime().optional().openapi({
      description: "Timestamp when the transaction was created",
      example: "2024-01-15T10:30:00Z",
    }),
    updatedTimestamp: z.string().datetime().optional().openapi({
      description: "Timestamp when the transaction was last updated",
      example: "2024-01-15T10:35:00Z",
    }),
  })
  .openapi("TransactionRecord");

export type TransactionRecord = z.infer<typeof TransactionRecordSchema>;

export const GetDetailsResponseSchema = z
  .object({
    paymentStatus: TransactionStatusSchema.openapi({
      description:
        "Overall payment status representing the current state of the payment",
    }),
    transactions: z.array(TransactionRecordSchema).openapi({
      description:
        "Array of all transaction records associated with this payment reference",
    }),
  })
  .openapi("GetDetailsResponse");

export type GetDetailsResponse = z.infer<typeof GetDetailsResponseSchema>;

// ============================================
// Process Payment (POST /process)
// ============================================
export const ProcessPaymentRequestSchema = z
  .object({
    appId: z.string().openapi({
      description: "The application ID",
      example: "DAWSON",
    }),
    token: z.string().openapi({
      description: "The payment token received from Pay.gov after user completes payment form",
      example: "abc123token",
    }),
  })
  .openapi("ProcessPaymentRequest");

export type ProcessPaymentRequest = z.infer<typeof ProcessPaymentRequestSchema>;

export const ProcessPaymentSuccessResponseSchema = z
  .object({
    trackingId: z.string().openapi({
      description: "Pay.gov tracking ID for the completed transaction",
      example: "TRK-123456789",
    }),
    transactionStatus: TransactionStatusSchema,
  })
  .openapi("ProcessPaymentSuccessResponse");

export type ProcessPaymentSuccessResponse = z.infer<
  typeof ProcessPaymentSuccessResponseSchema
>;

export const ProcessPaymentFailedResponseSchema = z
  .object({
    transactionStatus: TransactionStatusSchema,
    message: z.string().optional().openapi({
      description: "Error message describing the failure reason",
      example: "Payment was declined by the processor",
    }),
    code: z.number().optional().openapi({
      description: "Error code from Pay.gov",
      example: 1001,
    }),
  })
  .openapi("ProcessPaymentFailedResponse");

export type ProcessPaymentFailedResponse = z.infer<
  typeof ProcessPaymentFailedResponseSchema
>;

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
