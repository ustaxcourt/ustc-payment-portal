import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { mapCourtPeriods } from "@utils/courtDayBounds";
import { z } from "zod";
import {
  TransactionFeeBreakdownSchema,
  TransactionTotalPeriodSchema,
  TransactionYoYTrendsSchema,
} from "./TransactionLog.schema";

extendZodWithOpenApi(z);

export const RevenueSummaryPeriodSchema = TransactionTotalPeriodSchema.extend({
  fees: TransactionFeeBreakdownSchema,
}).openapi("RevenueSummaryPeriod", {
  description:
    "One dashboard period's collected total plus its per-fee tallies, " +
    "computed over the same window.",
});

/** Rejects every query parameter: this endpoint takes none, by rule. */
export const RevenueSummaryQuerySchema = z
  .object({})
  .strict()
  .openapi("RevenueSummaryQuery", {
    description: "No parameters. The summary is always all periods, as of now.",
  });

export const RevenueSummaryResponseSchema = z
  .object({
    totals: z
      .object(mapCourtPeriods(() => RevenueSummaryPeriodSchema))
      .openapi("RevenueSummaryTotals", {
        description:
          "Successful payments only, in fixed periods to date. Periods open " +
          "at Court-local midnight; the week opens on Sunday, and the " +
          "quarter and year are fiscal — the year opens on Oct 1.",
      }),
    // Optional is degradation, not a flag: totals must survive a failed
    // prior-year query, and the dashboard already falls back to N/A trends.
    yoyTrends: TransactionYoYTrendsSchema.optional(),
  })
  .openapi("RevenueSummaryResponse", {
    description:
      "Everything the dashboard's revenue totals table needs in one call: " +
      "per-period totals with fee tallies, and year-over-year trends. " +
      "Replaces composing `includeTotals` and per-period " +
      "`includeFeeBreakdown` calls on /transaction-log.",
  });

export type RevenueSummaryPeriod = z.infer<typeof RevenueSummaryPeriodSchema>;
export type RevenueSummaryResponse = z.infer<
  typeof RevenueSummaryResponseSchema
>;
