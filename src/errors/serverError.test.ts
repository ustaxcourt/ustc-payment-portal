import { ServerError } from "./serverError";

describe("ServerError", () => {
  it("creates error with custom message", () => {
    const error = new ServerError("Custom server error");

    expect(error).toBeInstanceOf(ServerError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Custom server error");
    expect(error.statusCode).toBe(500);
  });

  it("creates error with default message when no message is provided", () => {
    const error = new ServerError();

    expect(error).toBeInstanceOf(ServerError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Internal Server Error");
    expect(error.statusCode).toBe(500);
  });
});
