import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { DashboardTransactionSchema } from "./TransactionDashboard.schema";
import { PaymentStatusSchema } from "./PaymentStatus.schema";
import {
  courtDayBoundsForDateString,
  parseMonthDayYearDate,
} from "@utils/courtDayBounds";

extendZodWithOpenApi(z);

export const TRANSACTION_LOG_DEFAULT_PAGE_SIZE = 50;
export const TRANSACTION_LOG_MAX_PAGE_SIZE = 200;

const TRANSACTION_LOG_DATE_FORMAT_MESSAGE =
  "Date must be a valid ISO datetime or MM/DD/YYYY value";

const isValidIsoDateTime = (value: string): boolean =>
  !Number.isNaN(new Date(value).getTime()) && value.includes("T");

const parseTransactionLogDate = (
  value: string,
  side: "from" | "to",
): Date | undefined => {
  const courtDayBounds = courtDayBoundsForDateString(value);
  if (courtDayBounds) {
    return side === "from" ? courtDayBounds.start : courtDayBounds.end;
  }

  if (isValidIsoDateTime(value)) {
    return new Date(value);
  }

  return undefined;
};

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
  .superRefine((query, context) => {
    if ((query.from === undefined) !== (query.to === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "`from` and `to` must be supplied together",
        path: ["from"],
      });
      return;
    }

    if (!query.from || !query.to) {
      return;
    }

    if (!parseTransactionLogDate(query.from, "from")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: TRANSACTION_LOG_DATE_FORMAT_MESSAGE,
        path: ["from"],
      });
    }

    if (!parseTransactionLogDate(query.to, "to")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: TRANSACTION_LOG_DATE_FORMAT_MESSAGE,
        path: ["to"],
      });
    }
  })
  .transform((query, context) => {
    if (!query.from || !query.to) {
      return {
        status: query.status,
        page: query.page,
        pageSize: query.pageSize,
      };
    }

    const from = parseTransactionLogDate(query.from, "from");
    const to = parseTransactionLogDate(query.to, "to");

    if (!from || !to) {
      return z.NEVER;
    }

    if (!(from < to)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          parseMonthDayYearDate(query.from) || parseMonthDayYearDate(query.to)
            ? "`from` must be on or before `to`"
            : "`from` must be earlier than `to`",
        path: ["from"],
      });
      return z.NEVER;
    }

    return {
      from,
      to,
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
    };
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
