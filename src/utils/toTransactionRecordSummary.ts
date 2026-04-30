import TransactionModel from "../../src/db/TransactionModel";
import { TransactionRecordSummary } from "../schemas/TransactionRecord.schema";
import { TransactionStatus } from "../schemas/TransactionStatus.schema";
import { toApiPaymentMethod } from "./toApiPaymentMethod";

export const toTransactionRecordSummary = (
  row: TransactionModel,
  transactionStatus: TransactionStatus | null | undefined,
): TransactionRecordSummary => {
  if (!transactionStatus) {
    console.error(
      `Transaction ${row.agencyTrackingId} has null transactionStatus — defaulting to 'received'. This indicates corrupt data.`,
    );
  }
  return {
    payGovTrackingId: row.paygovTrackingId ?? undefined,
    transactionStatus: transactionStatus ?? "received",
    paymentMethod: toApiPaymentMethod(row.paymentMethod),
    returnDetail: row.returnDetail ?? undefined,
    createdTimestamp: row.createdAt,
    updatedTimestamp: row.lastUpdatedAt,
  };
};
