export class NotFoundError extends Error {
  public statusCode: number = 404;
  constructor(message: string = "Not Found") {
    super(message);
  }
}
