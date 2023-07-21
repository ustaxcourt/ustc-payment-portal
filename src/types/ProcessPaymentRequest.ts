export interface ProcessPaymentRequest {
  appId: string;
  token: string;
}

export interface ProcessPaymentRequestRaw extends ProcessPaymentRequest {
  authToken: string;
}
