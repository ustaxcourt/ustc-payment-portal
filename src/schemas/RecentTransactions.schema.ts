import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { DashboardTransactionSchema } from "./TransactionDashboard.schema";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

export const RecentTransactionsResponseSchema = z
  .object({
    data: z.array(DashboardTransactionSchema).openapi({
      description: "Up to 100 most recent transactions",
    }),
    total: z.number().int().nonnegative().openapi({
      description: "Total number of transactions returned in this response",
      example: 100,
    }),
  })
  .openapi("RecentTransactionsResponse");

export type RecentTransactionsResponse = z.infer<
  typeof RecentTransactionsResponseSchema
>;
