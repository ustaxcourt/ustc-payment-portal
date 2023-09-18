import { TransactionStatus } from "./TransactionStatus";

export type ProcessPaymentResponse =
  | SuccessfulProcessPaymentResponse
  | FailedProcessPaymentResponse;

export type SuccessfulProcessPaymentResponse = {
  trackingId: string;
  transactionStatus: TransactionStatus;
  message: undefined;
  code: undefined;
};

export type FailedProcessPaymentResponse = {
  trackingId: undefined;
  transactionStatus: TransactionStatus;
  message?: string;
  code?: number;
};
