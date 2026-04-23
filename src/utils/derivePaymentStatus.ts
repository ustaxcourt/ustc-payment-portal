import { PaymentStatus } from "../schemas/PaymentStatus.schema";
import TransactionModel from "../db/TransactionModel";
import { TransactionStatus } from "../schemas/TransactionStatus.schema";

export const derivePaymentStatus = (
  transactions: TransactionModel[],
): PaymentStatus => {
  if (transactions.some((t) => t.transactionStatus === "processed"))
    return "success";
  if (
    transactions.length > 0 &&
    transactions.every((t) => t.transactionStatus === "failed")
  )
    return "failed";
  return "pending";
};

export const derivePaymentStatusFromSingleTransaction = (
  status: TransactionStatus,
): PaymentStatus => {
  switch (status) {
    case "processed":
      return "success";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
};

