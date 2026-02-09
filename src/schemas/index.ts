import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

// ============================================
// Transaction Status
// ============================================
export const TransactionStatusSchema = z
  .enum(["Success", "Failed", "Pending"])
  .openapi({
    description: "The current status of the transaction",
    example: "Success",
  });

export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;

// ============================================
// Init Payment
// ============================================
export const InitPaymentRequestSchema = z
  .object({
    trackingId: z.string().openapi({
      description: "Unique identifier for tracking the payment",
      example: "TRK-12345",
    }),
    amount: z.number().positive().openapi({
      description: "Payment amount in dollars",
      example: 150.0,
    }),
    appId: z.string().openapi({
      description: "The TCS application ID",
      example: "USTC_APP",
    }),
    urlSuccess: z.string().url().openapi({
      description: "URL to redirect to after successful payment",
      example: "https://example.com/success",
    }),
    urlCancel: z.string().url().openapi({
      description: "URL to redirect to if payment is cancelled",
      example: "https://example.com/cancel",
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
// Process Payment
// ============================================
export const ProcessPaymentRequestSchema = z
  .object({
    appId: z.string().openapi({
      description: "The TCS application ID",
      example: "USTC_APP",
    }),
    token: z.string().openapi({
      description: "Payment token received from init payment",
      example: "abc123token",
    }),
  })
  .openapi("ProcessPaymentRequest");

export type ProcessPaymentRequest = z.infer<typeof ProcessPaymentRequestSchema>;

export const SuccessfulProcessPaymentResponseSchema = z
  .object({
    trackingId: z.string().openapi({
      description: "The Pay.gov tracking ID for the transaction",
      example: "PAYGOV-789",
    }),
    transactionStatus: TransactionStatusSchema,
  })
  .openapi("SuccessfulProcessPaymentResponse");

export const FailedProcessPaymentResponseSchema = z
  .object({
    transactionStatus: z.literal("Failed"),
    message: z.string().optional().openapi({
      description: "Error message if payment failed",
      example: "Card declined",
    }),
    code: z.number().optional().openapi({
      description: "Error code if payment failed",
      example: 4001,
    }),
  })
  .openapi("FailedProcessPaymentResponse");

export const ProcessPaymentResponseSchema = z
  .union([
    SuccessfulProcessPaymentResponseSchema,
    FailedProcessPaymentResponseSchema,
  ])
  .openapi("ProcessPaymentResponse");

export type ProcessPaymentResponse = z.infer<
  typeof ProcessPaymentResponseSchema
>;

// ============================================
// Get Details
// ============================================
export const GetDetailsRequestSchema = z
  .object({
    appId: z.string().openapi({
      description: "The TCS application ID",
      example: "USTC_APP",
    }),
    payGovTrackingId: z.string().openapi({
      description: "The Pay.gov tracking ID",
      example: "PAYGOV-789",
    }),
  })
  .openapi("GetDetailsRequest");

export type GetDetailsRequest = z.infer<typeof GetDetailsRequestSchema>;

export const GetDetailsResponseSchema = z
  .object({
    trackingId: z.string().openapi({
      description: "The Pay.gov tracking ID",
      example: "PAYGOV-789",
    }),
    transactionStatus: TransactionStatusSchema,
  })
  .openapi("GetDetailsResponse");

export type GetDetailsResponse = z.infer<typeof GetDetailsResponseSchema>;

// ============================================
// Internal validation schema (for SOAP request)
// ============================================
export const StartOnlineCollectionSchema = z.object({
  agencyTrackingId: z.string(),
  tcsAppId: z.string(),
  transactionAmount: z.number().positive(),
  urlCancel: z.string(),
  urlSuccess: z.string(),
});

export type StartOnlineCollectionParams = z.infer<
  typeof StartOnlineCollectionSchema
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
