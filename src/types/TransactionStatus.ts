export type TransactionStatus =
  | SuccessfulTransactionStatus
  | FailedTransactionStatus
  | PendingTransactionStatus;

export type SuccessfulTransactionStatus = "Success" | "Settled";

export type FailedTransactionStatus = "Cancelled" | "Failed" | "Retired";

export type PendingTransactionStatus = "Pending" | "Received" | "Waiting";
