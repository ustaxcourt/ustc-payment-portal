import type { TransactionRecordSummary } from "@schemas/TransactionRecord.schema";
import type TransactionModel from "../db/TransactionModel";
import { logger } from "./logger";
import { toApiPaymentMethod } from "./toApiPaymentMethod";

export const toTransactionRecordSummary = (
	row: TransactionModel,
): TransactionRecordSummary => {
	if (!row.transactionStatus) {
		logger.error(
			{
				transactionReferenceId: row.transactionReferenceId,
				agencyTrackingId: row.agencyTrackingId,
			},
			"Transaction Attempt has null transactionStatus — defaulting to 'received'. This indicates corrupt data.",
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
