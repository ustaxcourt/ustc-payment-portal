import type { AppContext } from "@appTypes/AppContext";
import {
  CANCEL_SWEEP_BATCH_SIZE,
  CANCEL_SWEEP_MAX_BATCHES,
} from "@/config/constants";
import TransactionModel from "../db/TransactionModel";
import { emitCancelSweepMetric } from "../health/cancelSweepMetric";

export type CancelExpiredTransactionsResult = {
  cancelledCount: number;
  batches: number;
  /** True when the batch cap was hit, so rows remain for the next scheduled run. */
  truncated: boolean;
};

export const cancelExpiredTransactions = async (
  appContext: AppContext,
): Promise<CancelExpiredTransactionsResult> => {
  let cancelledCount = 0;
  let batches = 0;
  let truncated = false;

  while (batches < CANCEL_SWEEP_MAX_BATCHES) {
    const cancelled =
      await TransactionModel.cancelExpiredBatch(CANCEL_SWEEP_BATCH_SIZE);
    batches += 1;
    cancelledCount += cancelled.length;

    if (cancelled.length > 0) {
      appContext.logger.info("Cancelled expired transactions", {
        count: cancelled.length,
        agencyTrackingIds: cancelled,
      });
    }

    if (cancelled.length < CANCEL_SWEEP_BATCH_SIZE) {
      emitCancelSweepMetric(cancelledCount);
      return { cancelledCount, batches, truncated };
    }
  }

  truncated = true;
  appContext.logger.warn("Cancel sweep hit its batch cap", {
    cancelledCount,
    batches,
  });
  emitCancelSweepMetric(cancelledCount);
  return { cancelledCount, batches, truncated };
};
