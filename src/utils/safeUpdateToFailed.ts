import TransactionModel from "../db/TransactionModel";
import { AppContext } from "../types/AppContext";

export const safeUpdateToFailed = async (
  appContext: AppContext,
  agencyTrackingId: string,
  code?: number,
  detail?: string,
): Promise<void> => {
  try {
    await TransactionModel.updateToFailed(agencyTrackingId, code, detail);
  } catch (err) {
    appContext.logger.error(
      `Failed to mark transaction '${agencyTrackingId}' as failed during error recovery:`,
      {
        errorName: err instanceof Error ? err.name : undefined,
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    );
  }
};
