import type { AppContext } from "@appTypes/AppContext";
import { CANCEL_SWEEP_BATCH_SIZE } from "@/config/constants";
import TransactionModel from "../db/TransactionModel";
import { emitCancelSweepMetric } from "../health/cancelSweepMetric";

export type CancelExpiredTransactionsResult = { cancelledCount: number };

// One bounded statement per run; the backfill clears the historical backlog.
export const cancelExpiredTransactions = async (
  appContext: AppContext,
): Promise<CancelExpiredTransactionsResult> => {
  const cancelled = await TransactionModel.cancelExpiredBatch(
    CANCEL_SWEEP_BATCH_SIZE,
  );

  if (cancelled.length > 0) {
    appContext.logger.info("Cancelled expired transactions", {
      count: cancelled.length,
      agencyTrackingIds: cancelled,
    });
  }

  emitCancelSweepMetric(cancelled.length);
  return { cancelledCount: cancelled.length };
};
