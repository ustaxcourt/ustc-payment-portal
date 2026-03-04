import { ForbiddenError } from "./forbidden";

describe("ForbiddenError", () => {
  it("creates error with custom message", () => {
    const error = new ForbiddenError("Client not registered");

    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Client not registered");
    expect(error.statusCode).toBe(403);
  });

  it("creates error with default message when no message provided", () => {
    const error = new ForbiddenError();

    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Forbidden - unexpected authorization failure, check auth pipeline");
    expect(error.statusCode).toBe(403);
  });
});
