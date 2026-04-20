import {
  PayGovTransactionStatus,
  TransactionStatus,
} from "../types/TransactionStatus";

export const parseTransactionStatus = (
  status: PayGovTransactionStatus
): TransactionStatus => {
  switch (status) {
    case "Pending":
    case "Received":
    case "Waiting":
    case "Submitted":
      return "pending";

    case "Settled":
    case "Success":
      return "processed";

    case "Cancelled":
    case "Failed":
    case "Retired":
      return "failed";

    default:
      throw new Error(`Could not parse transaction status ${status}`);
  }
};
