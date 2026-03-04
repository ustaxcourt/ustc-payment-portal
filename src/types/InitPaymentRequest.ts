export interface InitPaymentRequest {
  trackingId: string;
  amount: number;
  appId: string;
  feeId: string;
  urlSuccess: string;
  urlCancel: string;
}