import { UnauthorizedError } from "./unauthorized";

describe("UnauthorizedError", () => {
  it("creates error with custom message", () => {
    const error = new UnauthorizedError("Custom unauthorized message");

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Custom unauthorized message");
    expect(error.statusCode).toBe(403);
  });

  it("creates error with default message when no message provided", () => {
    const error = new UnauthorizedError();

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Unauthorized");
    expect(error.statusCode).toBe(403);
  });
});
