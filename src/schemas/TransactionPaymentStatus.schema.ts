import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

export const TransactionPaymentStatusResponseSchema = z
  .object({
    pending: z.number().int().nonnegative().openapi({
      description: "Count of transactions currently pending",
      example: 5,
    }),
    success: z.number().int().nonnegative().openapi({
      description: "Count of successful transactions",
      example: 42,
    }),
    failed: z.number().int().nonnegative().openapi({
      description: "Count of failed transactions",
      example: 3,
    }),
    total: z.number().int().nonnegative().openapi({
      description: "Total transactions across all statuses",
      example: 50,
    }),
  })
  .openapi("TransactionPaymentStatusResponse");

export type TransactionPaymentStatusResponse = z.infer<
  typeof TransactionPaymentStatusResponseSchema
>;
