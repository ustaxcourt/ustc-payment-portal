import TransactionModel from "../db/TransactionModel";
import type { AppContext } from "@appTypes/AppContext";

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
		appContext.logger.error(
			`Failed to mark transaction '${agencyTrackingId}' as failed during error recovery:`,
			{
				errorName: err instanceof Error ? err.name : undefined,
				errorMessage: err instanceof Error ? err.message : String(err),
			},
		);
	}
};
