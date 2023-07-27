import { TransactionStatus } from "./TransactionStatus";

export type ProcessPaymentResponse = {
  trackingId: string;
  transactionStatus: TransactionStatus;
};
