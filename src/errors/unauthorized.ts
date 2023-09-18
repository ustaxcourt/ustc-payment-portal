export class UnauthorizedError extends Error {
  public statusCode: number = 403;

  constructor(message: string = "Unauthorized") {
    super(message);
  }
}
