import { ConflictError } from "./conflict";

describe("ConflictError", () => {
  it("creates error with custom message", () => {
    const error = new ConflictError(
      "A payment session is already initiated for this transactionReferenceId",
    );

    expect(error).toBeInstanceOf(ConflictError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(
      "A payment session is already initiated for this transactionReferenceId",
    );
    expect(error.statusCode).toBe(409);
  });

  it("creates error with default message when no message provided", () => {
    const error = new ConflictError();

    expect(error).toBeInstanceOf(ConflictError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(
      "Conflict - request cannot be completed in the current resource state",
    );
    expect(error.statusCode).toBe(409);
  });
});
