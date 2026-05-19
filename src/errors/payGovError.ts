export class PayGovError extends Error {
  public statusCode: number;

  // Default 504 preserves PAY-305's initPayment contract.
  // PAY-306 passes 500 for response-level failures (malformed payload, DB persist
  // failure) where Pay.gov was reachable but the round-trip is unrecoverable for the client.
  constructor(message: string = "Error communicating with Pay.gov", statusCode: number = 504) {
    super(message);
    this.statusCode = statusCode;
  }
}
