export class ForbiddenError extends Error {
  public statusCode: number = 403;

  constructor(message: string = "Forbidden - unexpected authorization failure, check auth pipeline") {
    super(message);
  }
}
