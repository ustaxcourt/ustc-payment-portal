export class ServerError extends Error {
  public statusCode: number = 500;

  constructor(message: string = "Internal Server Error") {
    super(message);
  }
}
