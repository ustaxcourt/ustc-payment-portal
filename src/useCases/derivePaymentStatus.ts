import { TransactionStatus } from "../schemas/TransactionStatus.schema";
import { PaymentStatus } from "../schemas/PaymentStatus.schema";

export const derivePaymentStatus = (
  statuses: TransactionStatus[],
): PaymentStatus => {
  if (statuses.some((s) => s === "processed")) return "success";
  if (statuses.length > 0 && statuses.every((s) => s === "failed"))
    return "failed";
  return "pending";
};
