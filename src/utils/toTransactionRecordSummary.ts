import TransactionModel from "../db/TransactionModel";
import { TransactionRecordSummary } from "../schemas/TransactionRecord.schema";
import { toApiPaymentMethod } from "./toApiPaymentMethod";
import { logger } from "./getPortalLogger";

export const toTransactionRecordSummary = (
  row: TransactionModel,
): TransactionRecordSummary => {
  if (!row.transactionStatus) {
    logger.error("Transaction attempt has null transactionStatus", {
      transactionReferenceId: row.transactionReferenceId,
      agencyTrackingId: row.agencyTrackingId,
      fallbackTransactionStatus: "received",
    });
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
