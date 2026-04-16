import { NotFoundError } from "./notFound";

describe("NotFoundError", () => {
  it("creates error with custom message", () => {
    const error = new NotFoundError("Transaction could not be found");

    expect(error).toBeInstanceOf(NotFoundError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Transaction could not be found");
    expect(error.statusCode).toBe(404);
  });

  it("creates error with default message when no message provided", () => {
    const error = new NotFoundError();

    expect(error).toBeInstanceOf(NotFoundError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Not Found");
    expect(error.statusCode).toBe(404);
  });
});
