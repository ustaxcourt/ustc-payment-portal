export class PayGovError extends Error {
  public statusCode: number = 504;

  constructor(message: string = "Failed to communicate with Pay.gov") {
    super(message);
  }
}
