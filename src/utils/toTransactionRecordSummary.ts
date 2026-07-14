import type { TransactionRecordSummary } from "@schemas/TransactionRecord.schema";
import type TransactionModel from "../db/TransactionModel";
import { toApiPaymentMethod } from "./toApiPaymentMethod";

export const toTransactionRecordSummary = (
	row: TransactionModel,
): TransactionRecordSummary => {
	if (!row.transactionStatus) {
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
