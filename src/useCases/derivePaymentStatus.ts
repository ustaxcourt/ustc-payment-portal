import { TransactionStatus } from "../schemas/TransactionStatus.schema";
import { PaymentStatus } from "../schemas/PaymentStatus.schema";

export const derivePaymentStatus = (
  statuses: TransactionStatus[],
): PaymentStatus => {
  if (statuses.some((s) => s === "Success")) return "success";
  if (statuses.length > 0 && statuses.every((s) => s === "Failed"))
    return "failed";
  return "pending";
};
