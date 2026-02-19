import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { TransactionStatusSchema } from "./TransactionStatus.schema";
import { TransactionRecordSummarySchema } from "./TransactionRecord.schema";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

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

export const ProcessPaymentResponseSchema = z
  .object({
    paymentStatus: TransactionStatusSchema.openapi({
      description:
        "Overall payment status representing the current state of the payment",
    }),
    transactions: z.array(TransactionRecordSummarySchema).openapi({
      description:
        "Array of all transaction records associated with this payment reference",
    }),
  })
  .openapi("ProcessPaymentResponse");

export type ProcessPaymentResponse = z.infer<typeof ProcessPaymentResponseSchema>;

