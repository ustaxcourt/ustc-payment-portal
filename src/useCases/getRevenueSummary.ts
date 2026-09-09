import TransactionModel from "../db/TransactionModel";
import {
  RevenueSummaryResponseSchema,
  type RevenueSummaryResponse,
} from "@schemas/RevenueSummary.schema";
import type { AppContext } from "@appTypes/AppContext";
import {
  courtPeriodBounds,
  mapCourtPeriods,
  previousCourtPeriodBounds,
} from "@utils/courtDayBounds";
import { logger } from "@/utils/logger";
import { buildFeeBreakdown } from "./getTransactionLog";

export type GetRevenueSummary = (
  appContext: AppContext,
) => Promise<RevenueSummaryResponse>;

/** Everything the dashboard's revenue totals table needs, in one response.
 *  Totals are derived from the per-fee tallies' single statement snapshot, so
 *  a period's total always equals its summed fees. */
export const getRevenueSummary: GetRevenueSummary = async (
  _appContext: AppContext,
): Promise<RevenueSummaryResponse> => {
  // One clock read for both period sets, matching getTransactionLog.
  const now = new Date();
  const periods = courtPeriodBounds(now);
  const previousPeriods = previousCourtPeriodBounds(now);

  const [tallies, previousTotals] = await Promise.all([
    TransactionModel.feeTalliesByPeriods(periods),
    // Trends degrade rather than fail the totals, matching getTransactionLog.
    TransactionModel.totalsToDate(previousPeriods).catch((error) => {
      logger.warn(
        { error },
        "Unable to calculate previous-period totals for YoY trends",
      );
      return undefined;
    }),
  ]);

  // Summed in cents: decimal(12,2) values accumulate float drift as dollars.
  const currentTotals = mapCourtPeriods(
    (name) =>
      tallies[name].reduce(
        (cents, row) => cents + Math.round(row.subtotal * 100),
        0,
      ) / 100,
  );

  const totals = mapCourtPeriods((name) => ({
    from: periods[name].start.toISOString(),
    to: periods[name].end.toISOString(),
    total: currentTotals[name],
    fees: buildFeeBreakdown(tallies[name]),
  }));

  const yoyTrends = previousTotals
    ? TransactionModel.yoyTrends(currentTotals, previousTotals)
    : undefined;

  return RevenueSummaryResponseSchema.parse({
    totals,
    // Spread, so the key is absent rather than present-and-undefined.
    ...(yoyTrends && { yoyTrends }),
  });
};
