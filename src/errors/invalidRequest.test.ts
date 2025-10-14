import { InvalidRequestError } from "./invalidRequest";

describe("InvalidRequestError", () => {
  it("creates an error with default message", () => {
    const error = new InvalidRequestError();
    expect(error.message).toBe("Invalid Request");
    expect(error.statusCode).toBe(400);
    expect(error).toBeInstanceOf(Error);
  });

  it("creates an error with custom message", () => {
    const error = new InvalidRequestError("missing body");
    expect(error.message).toBe("missing body");
    expect(error.statusCode).toBe(400);
  });
});
