export class GoneError extends Error {
  public statusCode: number = 410;

  constructor(message: string = "Gone") {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;
  }
}
