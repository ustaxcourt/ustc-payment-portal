import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  courtDayBoundsForDateString,
  mapCourtPeriods,
} from "@utils/courtDayBounds";
import { z } from "zod";
import { FeeKeySchema } from "./FeeKey.schema";
import { PaymentMethodSchema } from "./PaymentMethod.schema";
import { PaymentStatusSchema } from "./PaymentStatus.schema";
import { DashboardTransactionSchema } from "./TransactionDashboard.schema";
import { TransactionStatusSchema } from "./TransactionStatus.schema";

extendZodWithOpenApi(z);

export const TRANSACTION_LOG_DEFAULT_PAGE_SIZE = 50;
export const TRANSACTION_LOG_MAX_PAGE_SIZE = 200;
/** `export=true` ceiling; one page (~1.7 MB) stays inside the 6 MB Lambda response limit. */
export const TRANSACTION_LOG_MAX_EXPORT_PAGE_SIZE = 5000;

const TRANSACTION_LOG_DATE_FORMAT_MESSAGE =
  "Date must be a valid ISO datetime or MM/DD/YYYY value";

const IsoDateTimeStringSchema = z.iso.datetime({ offset: true });

const parseTransactionLogDate = (
  value: string,
  side: "from" | "to",
): { date: Date; kind: "court-day" | "iso" } | undefined => {
  const courtDayBounds = courtDayBoundsForDateString(value);
  if (courtDayBounds) {
    return {
      date: side === "from" ? courtDayBounds.start : courtDayBounds.end,
      kind: "court-day",
    };
  }

  const isoDateTime = IsoDateTimeStringSchema.safeParse(value);
  if (isoDateTime.success) {
    return {
      date: new Date(isoDateTime.data),
      kind: "iso",
    };
  }

  return undefined;
};
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
    from: z.string().optional().openapi({
      description:
        "Inclusive lower bound on lastUpdatedAt. Accepts either an ISO timestamp or MM/DD/YYYY. Defaults with `to` to the current Court day.",
      example: "2026-08-03T04:00:00.000Z",
    }),
    to: z.string().optional().openapi({
      description:
        "Upper bound on lastUpdatedAt. ISO timestamps stay exact; MM/DD/YYYY expands to the end of that Court day.",
      example: "2026-08-04T04:00:00.000Z",
    }),
    status: PaymentStatusSchema.optional().openapi({
      description:
        "Restricts rows to one payment status. `counts` and `totals` ignore it.",
      example: "failed",
    }),
    fee: FeeKeySchema.optional().openapi({
      description:
        "Restricts rows to one fee type. `counts` and `totals` ignore it.",
      example: "PETITION_FILING_FEE",
    }),
    paymentMethod: PaymentMethodSchema.optional().openapi({
      description:
        "Restricts rows to one payment method. `counts` and `totals` ignore it.",
      example: "ACH",
    }),
    transactionStatus: TransactionStatusSchema.optional().openapi({
      description:
        "Restricts rows to one transaction attempt status. `counts` and `totals` ignore it.",
      example: "processed",
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
<<<<<<< HEAD
          "Adds `totals` and `yoyTrends` to the response. Fixed periods to " +
          "date; ignores `from`/`to` and `status`.",
=======
          "Adds `totals` to the response. Fixed periods to date; ignores " +
          "`from`/`to`, `status`, `fee`, `paymentMethod`, and `transactionStatus`.",
>>>>>>> main
        example: "true",
      }),
  })
  .superRefine((query, context) => {
    if ((query.from === undefined) !== (query.to === undefined)) {
      context.addIssue({
        code: "custom",
        message: "`from` and `to` must be supplied together",
        path: ["from"],
      });
      return;
    }

    if (!query.from || !query.to) {
      return;
    }
  })
  .transform((query, context) => {
    const refinedQuery = {
      from: undefined as Date | undefined,
      to: undefined as Date | undefined,
      status: query.status,
      fee: query.fee,
      paymentMethod: query.paymentMethod,
      transactionStatus: query.transactionStatus,
      page: query.page,
      pageSize: query.pageSize,
      export: query.export,
      sort: query.sort,
      order: query.order,
      includeTotals: query.includeTotals,
    };

    if (!query.from || !query.to) {
      return refinedQuery;
    }

    const from = parseTransactionLogDate(query.from, "from");
    const to = parseTransactionLogDate(query.to, "to");

    if (!from) {
      context.addIssue({
        code: "custom",
        message: TRANSACTION_LOG_DATE_FORMAT_MESSAGE,
        path: ["from"],
      });
    }

    if (!to) {
      context.addIssue({
        code: "custom",
        message: TRANSACTION_LOG_DATE_FORMAT_MESSAGE,
        path: ["to"],
      });
    }

    if (!from || !to) {
      return z.NEVER;
    }

    if (!(from.date < to.date)) {
      context.addIssue({
        code: "custom",
        message:
          from.kind === "court-day" || to.kind === "court-day"
            ? "`from` must be on or before `to`"
            : "`from` must be earlier than `to`",
        path: ["from"],
      });
      return z.NEVER;
    }

    return {
      ...refinedQuery,
      from: from.date,
      to: to.date,
    };
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
      "Totals for the requested timeframe. Unaffected by `status`, `fee`, " +
      "`paymentMethod`, and `transactionStatus`, so the tallies stay stable " +
      "as the user filters.",
  });

export const TransactionTotalPeriodSchema = z
  .object({
    from: z.string().datetime().openapi({
      description: "Court-local midnight the period opened at",
    }),
    to: z.string().datetime().openapi({
      description: "Instant the period was totalled at — now, not period end",
    }),
    // No nonnegative(): a CHECK constraint already guarantees it, and a
    // response schema enforcing it again would turn a data anomaly into a 500
    // on a read-only call.
    total: z.number().openapi({
      description: "Summed transaction amounts in USD",
    }),
  })
  .openapi("TransactionTotalPeriod");

const buildCourtPeriodSchemaShape = <Schema extends z.ZodTypeAny>(
  schema: Schema,
) => mapCourtPeriods(() => schema);

export const TransactionTotalsSchema = z
  .object(buildCourtPeriodSchemaShape(TransactionTotalPeriodSchema))
  .openapi("TransactionTotals", {
    description:
      "Successful payments only, in fixed periods to date. Unaffected by the " +
      "requested timeframe and by `status`, `fee`, `paymentMethod`, and " +
      "`transactionStatus`, so the figures stay stable as the user filters. " +
      "Periods open at Court-local midnight; the week opens on Sunday, and " +
      "the quarter and year are fiscal — the year opens on Oct 1. Omitted on " +
      "export requests for pages after the first.",
  });

const YoYComparisonSchema = z.object({
  current: z.number().openapi({
    description: "Amount collected during the current timeframe",
  }),
  previous: z.number().openapi({
    description:
      "Amount collected during the corresponding timeframe one year earlier",
  }),
  difference: z.number().openapi({
    description: "Current amount minus previous amount",
  }),
  percentChange: z.number().nullable().openapi({
    description:
      "Percentage change from the previous period, or null when the previous total is zero",
  }),
});

export const TransactionYoYTrendsSchema = z
  .object(buildCourtPeriodSchemaShape(YoYComparisonSchema))
  .openapi("TransactionYoYTrends", {
    description:
      "Year-over-year comparison of successful payment totals for each dashboard period.",
  });

export const TransactionLogResponseSchema = z
  .object({
    data: z.array(TransactionLogEntrySchema).openapi({
      description:
        "Rows for the requested page, ordered by the resolved `sort`/`order`",
    }),
    counts: TransactionCountsSchema.optional().openapi({
      description:
        "Totals for the requested timeframe. Unaffected by `status`, `fee`, " +
        "`paymentMethod`, and `transactionStatus`, so the tallies stay " +
        "stable as the user filters. Omitted on export requests for pages " +
        "after the first.",
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
    total: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .openapi({
        description:
<<<<<<< HEAD
          "Rows matching the timeframe and status filter, across all pages. " +
          "Omitted on export requests for pages after the first.",
=======
          "Rows matching the timeframe and all applied filters (`status`, " +
          "`fee`, `paymentMethod`, `transactionStatus`), across all pages — " +
          "unlike `counts` and `totals`, this figure is narrowed by every " +
          "filter. Omitted on export requests for pages after the first.",
>>>>>>> main
      }),
    totals: TransactionTotalsSchema.optional(),
    yoyTrends: TransactionYoYTrendsSchema.optional(),
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
export type TransactionYoYTrends = z.infer<typeof TransactionYoYTrendsSchema>;
