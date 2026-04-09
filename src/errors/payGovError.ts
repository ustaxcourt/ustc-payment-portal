export class PayGovError extends Error {
  public statusCode: number = 504;

  constructor(message: string = "Error communicating with Pay.gov") {
    super(message);
  }
}
