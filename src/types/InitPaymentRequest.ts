export interface InitPaymentRequest {
  trackingId: string;
  amount: number;
  appId: string;
  urlSuccess: string;
  urlCancel: string;
}

export interface InitPaymentRequestRaw extends InitPaymentRequest {
  authToken: string;
}
