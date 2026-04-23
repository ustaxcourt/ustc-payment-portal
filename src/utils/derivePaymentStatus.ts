import { PaymentStatus } from "../schemas/PaymentStatus.schema";
import TransactionModel from "../db/TransactionModel";

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
