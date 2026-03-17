import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { PaymentStatusSchema } from "./PaymentStatus.schema";
import { TransactionRecordSummarySchema } from "./TransactionRecord.schema";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

export const RecentTransactionRequestSchema = z
  .object({
    paymentStatus: PaymentStatusSchema.optional().openapi({
      description: "Filter transactions by payment status",
      example: "success",
    }),
  })
  .openapi("RecentTransactionRequest");

export type RecentTransactionRequest = z.infer<typeof RecentTransactionRequestSchema>;

export const RecentTransactionResponseSchema = z
  .object({
    paymentStatus: PaymentStatusSchema.openapi({
      description:
        "Overall payment status representing the current state of the payment",
    }),
    transactions: z.array(TransactionRecordSummarySchema).openapi({
      description:
        "Array of all transaction records associated with this payment reference",
    }),
  })
  .openapi("RecentTransactionResponse");

export type RecentTransactionResponse = z.infer<typeof RecentTransactionResponseSchema>;

