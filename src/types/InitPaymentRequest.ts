export type InitPaymentRequest = {
  authToken: string;
  trackingId: string;
  amount: number;
  appId: string;
  urlSuccess: string;
  urlCancel: string;
};
