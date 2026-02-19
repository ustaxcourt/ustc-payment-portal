import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { TransactionStatusSchema } from "./TransactionStatus.schema";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

export const TransactionRecordSchema = z
  .object({
    payGovTrackingId: z.string().openapi({
      description: "Pay.gov tracking ID for the transaction",
      example: "TRK-123456789",
    }),
    transactionStatus: TransactionStatusSchema,
    paymentMethod: z.string().optional().openapi({
      description: "Method of payment (e.g., card, ACH)",
      example: "card",
    }),
    returnDetail: z.string().optional().openapi({
      description: "Detailed return message from Pay.gov",
      example: "Transaction completed successfully",
    }),
    returnCode: z.string().optional().openapi({
      description: "Return code from Pay.gov",
      example: "1000",
    }),
    createdTimestamp: z.iso.datetime().optional().openapi({
      description: "Timestamp when the transaction was created",
      example: "2024-01-15T10:30:00Z",
    }),
    updatedTimestamp: z.iso.datetime().optional().openapi({
      description: "Timestamp when the transaction was last updated",
      example: "2024-01-15T10:35:00Z",
    }),
  })
  .openapi("TransactionRecord");

export type TransactionRecord = z.infer<typeof TransactionRecordSchema>;

export const TransactionRecordSummarySchema = z
  .object({
    transactionStatus: TransactionStatusSchema,
    paymentMethod: z.string().optional().openapi({
      description: "Method of payment (e.g., card, ACH)",
      example: "card",
    }),
    returnDetail: z.string().optional().openapi({
      description: "Detailed return message from Pay.gov",
      example: "Transaction completed successfully",
    }),
    createdTimestamp: z.iso.datetime().optional().openapi({
      description: "Timestamp when the transaction was created",
      example: "2024-01-15T10:30:00Z",
    }),
    updatedTimestamp: z.iso.datetime().optional().openapi({
      description: "Timestamp when the transaction was last updated",
      example: "2024-01-15T10:35:00Z",
    }),
  })
  .openapi("TransactionRecordSummary");

export type TransactionRecordSummary = z.infer<typeof TransactionRecordSummarySchema>;
