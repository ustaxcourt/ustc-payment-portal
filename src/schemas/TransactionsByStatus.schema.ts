import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { PaymentStatusSchema } from "./PaymentStatus.schema";
import { RecentTransactionsResponseSchema } from "./RecentTransactions.schema";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

export const TransactionsByStatusPathParamsSchema = z
  .object({
    paymentStatus: PaymentStatusSchema.openapi({
      description: "Filter transactions by overall payment status",
      example: "pending",
    }),
  })
  .openapi("TransactionsByStatusPathParams");

export type TransactionsByStatusPathParams = z.infer<
  typeof TransactionsByStatusPathParamsSchema
>;

export const TransactionsByStatusResponseSchema = RecentTransactionsResponseSchema
  .extend({})
  .openapi("TransactionsByStatusResponse");

export type TransactionsByStatusResponse = z.infer<
  typeof TransactionsByStatusResponseSchema
>;
