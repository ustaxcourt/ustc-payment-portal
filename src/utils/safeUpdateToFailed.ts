import { AppContext } from "../types/AppContext";
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
    appContext.logger.error(
      `Failed to mark transaction as failed during error recovery`,
      { agencyTrackingId, code, detail, err },
    );
  }
};
