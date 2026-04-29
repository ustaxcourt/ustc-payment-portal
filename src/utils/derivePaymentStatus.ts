import { TransactionStatus } from "../schemas/TransactionStatus.schema";
import { PaymentStatus } from "../schemas/PaymentStatus.schema";

// Accepts any object that exposes a transactionStatus field — TransactionModel
// rows from the DB and TransactionRecordSummary objects from a refreshed response
// both qualify, which lets callers derive obligation status without converting shapes.
type HasTransactionStatus = {
  transactionStatus?: TransactionStatus | null;
};

export const derivePaymentStatus = <T extends HasTransactionStatus>(
  transactions: T[],
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
