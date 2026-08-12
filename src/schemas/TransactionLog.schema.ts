import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { DashboardTransactionSchema } from "./TransactionDashboard.schema";
import { PaymentStatusSchema } from "./PaymentStatus.schema";

extendZodWithOpenApi(z);

export const TRANSACTION_LOG_DEFAULT_PAGE_SIZE = 50;
export const TRANSACTION_LOG_MAX_PAGE_SIZE = 200;

/** A closed list, so nothing from the query string reaches SQL as an identifier. */
export const TRANSACTION_LOG_SORT_FIELDS = [
  "createdAt",
  "lastUpdatedAt",
  "feeName",
  "transactionAmount",
  "paymentMethod",
  "paymentStatus",
  "returnDetail",
  "transactionStatus",
  "clientName",
  "transactionReferenceId",
] as const;

export const SORT_ORDERS = ["asc", "desc"] as const;

export const TRANSACTION_LOG_DEFAULT_SORT = "lastUpdatedAt";
export const TRANSACTION_LOG_DEFAULT_ORDER = "desc";

export const TransactionLogSortFieldSchema = z
  .enum(TRANSACTION_LOG_SORT_FIELDS)
  .openapi("TransactionLogSortField", {
    description: "Column the transaction log is ordered by",
  });

export const SortOrderSchema = z.enum(SORT_ORDERS).openapi("SortOrder", {
  description: "Direction the transaction log is ordered in",
});

export type TransactionLogSortField = z.infer<
  typeof TransactionLogSortFieldSchema
>;
export type SortOrder = z.infer<typeof SortOrderSchema>;

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
    sort: TransactionLogSortFieldSchema.default(
      TRANSACTION_LOG_DEFAULT_SORT,
    ).openapi({
      description:
        "Column to order by. `feeName` and `paymentMethod` order by the label " +
        "the response returns, not the value stored in the column.",
      example: "createdAt",
    }),
    order: SortOrderSchema.default(TRANSACTION_LOG_DEFAULT_ORDER).openapi({
      description:
        "Direction for `sort`. Rows with no value for the sorted column are " +
        "listed last in both directions.",
      example: "desc",
    }),
  })
  .refine((query) => (query.from === undefined) === (query.to === undefined), {
    message: "`from` and `to` must be supplied together",
    path: ["from"],
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
      description:
        "Rows for the requested page, ordered by the resolved `sort`/`order`",
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
    // Echoed back like the timeframe, so the caller can confirm what was applied.
    sort: TransactionLogSortFieldSchema,
    order: SortOrderSchema,
    total: z.number().int().nonnegative().openapi({
      description:
        "Rows matching the timeframe and status filter, across all pages",
    }),
  })
  .openapi("TransactionLogResponse");

export type TransactionLogResponse = z.infer<
  typeof TransactionLogResponseSchema
>;
