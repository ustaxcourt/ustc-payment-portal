import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { DashboardTransactionSchema } from "./TransactionDashboard.schema";
import { PaymentStatusSchema } from "./PaymentStatus.schema";

extendZodWithOpenApi(z);

export const TRANSACTION_LOG_DEFAULT_PAGE_SIZE = 50;
export const TRANSACTION_LOG_MAX_PAGE_SIZE = 200;
/** `export=true` ceiling; one page (~1.7 MB) stays inside the 6 MB Lambda response limit. */
export const TRANSACTION_LOG_MAX_EXPORT_PAGE_SIZE = 5000;

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
      .max(TRANSACTION_LOG_MAX_EXPORT_PAGE_SIZE)
      .default(TRANSACTION_LOG_DEFAULT_PAGE_SIZE)
      .openapi({
        description:
          "Rows per page. Capped at 200, or 5000 when `export=true`.",
        example: 50,
      }),
    export: z
      .enum(["true", "false"])
      .openapi({
        description:
          "Marks an export request: raises the `pageSize` ceiling to 5000, " +
          "and pages after the first omit `counts` and `total` (the caller " +
          "already has them from page 1). Pages are not a consistent " +
          "snapshot: a row updated between page requests can shift page " +
          "boundaries, so export clients should verify their assembled row " +
          "count against page 1's `total` and refetch on a mismatch.",
        example: "true",
      })
      .default("false")
      .transform((value) => value === "true"),
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
    // Not z.coerce.boolean(): that is Boolean(value), so the non-empty string
    // "false" would switch totals on.
    includeTotals: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true")
      .openapi({
        description:
          "Adds `totals` to the response. Fixed periods to date; ignores " +
          "`from`/`to` and `status`.",
        example: "true",
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
  .refine(
    (query) => query.export || query.pageSize <= TRANSACTION_LOG_MAX_PAGE_SIZE,
    {
      message: `\`pageSize\` above ${TRANSACTION_LOG_MAX_PAGE_SIZE} requires \`export=true\``,
      path: ["pageSize"],
    },
  )
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

export const TransactionTotalPeriodSchema = z
  .object({
    from: z.string().datetime().openapi({
      description: "Court-local midnight the period opened at",
    }),
    to: z.string().datetime().openapi({
      description: "Instant the period was totalled at — now, not period end",
    }),
    total: z.number().nonnegative().openapi({
      description: "Summed transaction amounts in USD",
    }),
  })
  .openapi("TransactionTotalPeriod");

export const TransactionTotalsSchema = z
  .object({
    day: TransactionTotalPeriodSchema,
    week: TransactionTotalPeriodSchema,
    month: TransactionTotalPeriodSchema,
    quarter: TransactionTotalPeriodSchema,
    fiscalYear: TransactionTotalPeriodSchema,
  })
  .openapi("TransactionTotals", {
    description:
      "Successful payments only, in fixed periods to date. Unaffected by the " +
      "timeframe and status filters, so the figures stay stable as the user " +
      "filters. Periods open at Court-local midnight; the week opens on " +
      "Sunday, and the quarter and year are fiscal — the year opens on Oct 1.",
  });

export const TransactionLogResponseSchema = z
  .object({
    data: z.array(TransactionLogEntrySchema).openapi({
      description:
        "Rows for the requested page, ordered by the resolved `sort`/`order`",
    }),
    counts: TransactionCountsSchema.optional().openapi({
      description:
        "Totals for the requested timeframe, unaffected by the status filter " +
        "so the tallies stay stable as the user filters. Omitted on export " +
        "requests for pages after the first.",
    }),
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
    total: z.number().int().nonnegative().optional().openapi({
      description:
        "Rows matching the timeframe and status filter, across all pages. " +
        "Omitted on export requests for pages after the first.",
    }),
    totals: TransactionTotalsSchema.optional(),
  })
  .refine(
    (response) =>
      (response.counts === undefined) === (response.total === undefined),
    {
      message: "`counts` and `total` must be omitted together",
      path: ["counts"],
    },
  )
  .openapi("TransactionLogResponse");

export type TransactionLogResponse = z.infer<
  typeof TransactionLogResponseSchema
>;

export type TransactionTotals = z.infer<typeof TransactionTotalsSchema>;
