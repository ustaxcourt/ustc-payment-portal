import TransactionModel from "../db/TransactionModel";

export const safeUpdateToFailed = async (
  agencyTrackingId: string,
  code?: number,
  detail?: string,
): Promise<void> => {
  try {
    await TransactionModel.updateToFailed(agencyTrackingId, code, detail);
  } catch (err) {
    console.error(
      `Failed to mark transaction '${agencyTrackingId}' as failed during error recovery:`,
      err,
    );
  }
};
