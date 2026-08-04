import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { DashboardTransactionSchema } from "./TransactionDashboard.schema";
import { PaymentStatusSchema } from "./PaymentStatus.schema";

extendZodWithOpenApi(z);

export const TRANSACTION_LOG_DEFAULT_PAGE_SIZE = 50;
export const TRANSACTION_LOG_MAX_PAGE_SIZE = 200;

export const TransactionLogQuerySchema = z
  .object({
    from: z.coerce.date().optional().openapi({
      description:
        "Inclusive lower bound on lastUpdatedAt. Defaults with `to` to the current Court day.",
      example: "2026-08-03T04:00:00.000Z",
    }),
    to: z.coerce.date().optional().openapi({
      description: "Exclusive upper bound on lastUpdatedAt.",
      example: "2026-08-04T04:00:00.000Z",
    }),
    status: PaymentStatusSchema.optional().openapi({
      description:
        "Restricts rows to one payment status. Aggregate counts ignore it.",
      example: "failed",
    }),
    page: z.coerce.number().int().min(1).default(1).openapi({
      description: "1-indexed page number",
      example: 1,
    }),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(TRANSACTION_LOG_MAX_PAGE_SIZE)
      .default(TRANSACTION_LOG_DEFAULT_PAGE_SIZE)
      .openapi({ description: "Rows per page", example: 50 }),
  })
  .refine((query) => !query.from || !query.to || query.from < query.to, {
    message: "`from` must be earlier than `to`",
    path: ["from"],
  })
  .openapi("TransactionLogQuery");

export type TransactionLogQuery = z.infer<typeof TransactionLogQuerySchema>;

/** Kept off DashboardTransactionSchema so Zod strips these from /transactions,
 *  which the dev dashboard depends on. */
export const TransactionLogEntrySchema = DashboardTransactionSchema.extend({
  returnCode: z.number().int().nullable().optional().openapi({
    description: "Pay.gov return code, set when a payment fails",
    example: 102,
  }),
  returnDetail: z.string().nullable().optional().openapi({
    description: "Pay.gov failure reason, set when a payment fails",
    example: "Insufficient funds",
  }),
}).openapi("TransactionLogEntry");

export const TransactionCountsSchema = z
  .object({
    all: z.number().int().nonnegative(),
    success: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
  })
  .openapi("TransactionCounts", {
    description:
      "Totals for the requested timeframe, unaffected by the status filter so the tallies stay stable as the user filters.",
  });

export const TransactionLogResponseSchema = z
  .object({
    data: z.array(TransactionLogEntrySchema).openapi({
      description: "Rows for the requested page, newest lastUpdatedAt first",
    }),
    counts: TransactionCountsSchema,
    from: z.string().datetime().openapi({
      description: "Resolved lower bound actually queried",
    }),
    to: z.string().datetime().openapi({
      description: "Resolved upper bound actually queried",
    }),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().nonnegative().openapi({
      description:
        "Rows matching the timeframe and status filter, across all pages",
    }),
  })
  .openapi("TransactionLogResponse");

export type TransactionLogResponse = z.infer<
  typeof TransactionLogResponseSchema
>;
