export interface InitPaymentRequest {
  trackingId: string;
  amount: number;
  feeId: string;
  urlSuccess: string;
  urlCancel: string;
}