import type { AppContext } from "@appTypes/AppContext";
import { CANCEL_SWEEP_BATCH_SIZE } from "@/config/constants";
import TransactionModel from "../db/TransactionModel";
import { emitCancelSweepMetric } from "../health/cancelSweepMetric";
import { emitPaymentOutcomeUnknownMetric } from "../health/paymentOutcomeUnknownMetric";

export type CancelExpiredTransactionsResult = { cancelledCount: number };

export const cancelExpiredTransactions = async (
  appContext: AppContext,
): Promise<CancelExpiredTransactionsResult> => {
  const cancelled = await TransactionModel.cancelExpiredBatch(
    CANCEL_SWEEP_BATCH_SIZE,
  );
  const unknownCount = await TransactionModel.countStaleProcessingWithoutTrackingId();

  if (cancelled.length > 0) {
    appContext.logger.info("Cancelled expired transactions", {
      count: cancelled.length,
      agencyTrackingIds: cancelled,
    });
  }

  if (unknownCount > 0) {
    appContext.logger.warn("Found stale processing transactions with unknown payment outcomes", {
      count: unknownCount,
    });
  }

  emitCancelSweepMetric(cancelled.length);
  emitPaymentOutcomeUnknownMetric(unknownCount);
  return { cancelledCount: cancelled.length };
};
