import TransactionModel from "../db/TransactionModel";
import { TransactionRecordSummary } from "../schemas/TransactionRecord.schema";
import { toApiPaymentMethod } from "./toApiPaymentMethod";

export const toTransactionRecordSummary = (
  row: TransactionModel,
): TransactionRecordSummary => {
  if (!row.transactionStatus) {
    console.error(
      `Transaction ${row.agencyTrackingId} has null transactionStatus — defaulting to 'received'. This indicates corrupt data.`,
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
