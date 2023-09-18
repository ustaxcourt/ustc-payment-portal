export class FailedTransactionError extends Error {
  public code?: number;

  constructor(message: string = "Transaction Error", code?: number) {
    super(message);
    this.code = code;
  }
}
