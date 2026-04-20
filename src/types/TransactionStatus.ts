export type PayGovTransactionStatus =
  | SuccessfulTransactionStatus
  | FailedTransactionStatus
  | PendingTransactionStatus;

export type SuccessfulTransactionStatus = "Success" | "Settled";

export type FailedTransactionStatus = "Cancelled" | "Failed" | "Retired";

export type PendingTransactionStatus =
  | "Pending"
  | "Received"
  | "Waiting"
  | "Submitted";

export type TransactionStatus = "processed" | "failed" | "pending";
