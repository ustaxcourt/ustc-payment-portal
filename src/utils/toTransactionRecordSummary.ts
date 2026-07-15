import type { AppContext } from "@appTypes/AppContext";
import type { TransactionRecordSummary } from "@schemas/TransactionRecord.schema";
import type TransactionModel from "../db/TransactionModel";
import { toApiPaymentMethod } from "./toApiPaymentMethod";

export const toTransactionRecordSummary = (
	appContext: AppContext,
	row: TransactionModel,
): TransactionRecordSummary => {
	if (!row.transactionStatus) {
		appContext.logger.error(
			"Transaction Attempt has null transactionStatus — defaulting to 'received'. This indicates corrupt data.",
			{
				transactionReferenceId: row.transactionReferenceId,
				agencyTrackingId: row.agencyTrackingId,
			},
		);
	}
	return {
		payGovTrackingId: row.paygovTrackingId ?? undefined,
		transactionStatus: row.transactionStatus ?? "received",
		paymentMethod: toApiPaymentMethod(row.paymentMethod),
		returnDetail: row.returnDetail ?? undefined,
		createdTimestamp: row.createdAt,
		updatedTimestamp: row.lastUpdatedAt,
	};
};
