export class InvalidRequestError extends Error {
  public statusCode: number = 400;

  constructor(message: string = "Invalid Request") {
    super(message);
  }
}
