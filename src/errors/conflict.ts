export class ConflictError extends Error {
  public statusCode: number = 409;

  constructor(
    message: string = "Conflict - request cannot be completed in the current resource state",
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;
  }
}
