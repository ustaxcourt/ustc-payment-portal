import {
  PayGovTransactionStatus,
  TransactionStatus,
} from "../types/TransactionStatus";

export const parseTransactionStatus = (
  status: PayGovTransactionStatus,
): TransactionStatus => {
  switch (status) {
    case "Pending":
    case "Received":
    case "Waiting":
    case "Submitted":
      return "Pending";

    case "Settled":
    case "Success":
      return "Success";

    case "Cancelled":
    case "Failed":
    case "Retired":
      return "Failed";

    default:
      throw new Error(`Could not parse transaction status ${status}`);
  }
};
