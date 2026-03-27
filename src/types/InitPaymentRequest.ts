export interface InitPaymentRequest {
  feeId: string;
  urlSuccess: string;
  urlCancel: string;
  metadata: Record<string, string>;
  clientName: string;
}
