export class ConflictError extends Error {
  public static readonly PAYMENT_IN_FLIGHT_MESSAGE =
    "A payment is already being processed for this token";

  public static readonly PAYMENT_IN_FLIGHT_TRANSACTION_MESSAGE =
    "A payment is already being processed for this transaction. Wait for it to finish before initiating a new payment.";

  public static readonly PERSIST_RACE_MESSAGE =
    "Could not record the payment result because the transaction state changed. Use getDetails to check the current status.";

  public statusCode: number = 409;

  constructor(
    message: string = "Conflict - request cannot be completed in the current resource state",
  ) {
    super(message);
  }
}
