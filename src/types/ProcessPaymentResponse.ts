import { TransactionStatus } from "./TransactionStatus";

export type ProcessPaymentResponse = {
  trackingId: string;
  paymentStatus: TransactionStatus;
};
