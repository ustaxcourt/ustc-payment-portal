export class FailedTransactionError extends Error {
  public code?: number;

  constructor(message: string = "Transaction Error", code?: number) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;
    this.code = code;
  }
}
