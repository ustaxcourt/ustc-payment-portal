export type InitPaymentRequest = {
  trackingId: string;
  amount: number;
  appId: string;
  urlSuccess: string;
  urlCancel: string;
};
