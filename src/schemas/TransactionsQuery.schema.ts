import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  courtDayBoundsForDateString,
  parseMonthDayYearDate,
} from "@utils/courtDayBounds";
import { z } from "zod";
import { PaymentStatusSchema } from "./PaymentStatus.schema";
import {
  TRANSACTION_LOG_DEFAULT_PAGE_SIZE,
  TRANSACTION_LOG_MAX_PAGE_SIZE,
} from "./TransactionLog.schema";

extendZodWithOpenApi(z);

const TRANSACTION_DATE_FORMAT_MESSAGE = "Date must be a valid MM/DD/YYYY value";
export const TRANSACTIONS_QUERY_PARAM_KEYS = [
  "from",
  "to",
  "status",
  "page",
  "pageSize",
] as const;

const compareDateInputs = (from: string, to: string): number => {
  const fromDate = parseMonthDayYearDate(from);
  const toDate = parseMonthDayYearDate(to);

  if (!fromDate || !toDate) {
    return Number.NaN;
  }

  return (
    Date.UTC(fromDate.year, fromDate.month - 1, fromDate.day) -
    Date.UTC(toDate.year, toDate.month - 1, toDate.day)
  );
};

export const TransactionsQuerySchema = z
  .object({
    from: z.string().optional().openapi({
      description:
        "Inclusive lower bound on lastUpdatedAt, formatted as MM/DD/YYYY.",
      example: "08/10/2026",
    }),
    to: z.string().optional().openapi({
      description:
        "Inclusive upper bound on lastUpdatedAt, formatted as MM/DD/YYYY.",
      example: "08/10/2026",
    }),
    status: PaymentStatusSchema.optional().openapi({
      description: "Restricts rows to one payment status.",
      example: "pending",
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
        code: "custom",
        message: "`from` and `to` must be supplied together",
        path: ["from"],
      });
      return;
    }

    if (!query.from || !query.to) {
      return;
    }

    if (!parseMonthDayYearDate(query.from)) {
      context.addIssue({
        code: "custom",
        message: TRANSACTION_DATE_FORMAT_MESSAGE,
        path: ["from"],
      });
    }

    if (!parseMonthDayYearDate(query.to)) {
      context.addIssue({
        code: "custom",
        message: TRANSACTION_DATE_FORMAT_MESSAGE,
        path: ["to"],
      });
    }

    if (compareDateInputs(query.from, query.to) > 0) {
      context.addIssue({
        code: "custom",
        message: "`from` must be on or before `to`",
        path: ["from"],
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

    const fromBounds = courtDayBoundsForDateString(query.from);
    const toBounds = courtDayBoundsForDateString(query.to);

    if (!fromBounds || !toBounds) {
      context.addIssue({
        code: "custom",
        message: TRANSACTION_DATE_FORMAT_MESSAGE,
      });
      return z.NEVER;
    }

    return {
      from: fromBounds.start,
      to: toBounds.end,
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
    };
  })
  .openapi("TransactionsQuery");

export type TransactionsQuery = z.infer<typeof TransactionsQuerySchema>;
