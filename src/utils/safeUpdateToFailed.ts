import type { AppContext } from "@appTypes/AppContext";
import { logError } from "@utils/logError";
import TransactionModel from "../db/TransactionModel";

export const safeUpdateToFailed = async (
  appContext: AppContext,
  agencyTrackingId: string,
  code?: number,
  detail?: string,
): Promise<void> => {
  try {
    await TransactionModel.updateToFailed(agencyTrackingId, code, detail);
  } catch (err) {
    /* istanbul ignore next: This branch is for DB persistence failures, which are rare in normal operation */
    logError(
      appContext,
      `Failed to mark transaction '${agencyTrackingId}' as failed during error recovery:`,
      err,
    );
  }
};
