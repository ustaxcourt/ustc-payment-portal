export interface InitPaymentRequest {
  trackingId: string;
  amount: number;
  appId: string;
  urlSuccess: string;
  urlCancel: string;
}