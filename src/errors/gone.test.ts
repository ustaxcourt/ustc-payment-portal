import { GoneError } from "./gone";

describe("GoneError", () => {
  it("creates error with custom message", () => {
    const error = new GoneError("This token is no longer valid.");

    expect(error).toBeInstanceOf(GoneError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("This token is no longer valid.");
    expect(error.statusCode).toBe(410);
  });

  it("creates error with default message when no message provided", () => {
    const error = new GoneError();

    expect(error).toBeInstanceOf(GoneError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Gone");
    expect(error.statusCode).toBe(410);
  });
});
