import { PayGovError } from "./payGovError";

describe("PayGovError", () => {
  it("creates error with custom message", () => {
    const error = new PayGovError("Custom Pay.gov error");

    expect(error).toBeInstanceOf(PayGovError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Custom Pay.gov error");
    expect(error.statusCode).toBe(504);
  });

  it("creates error with default message when no message is provided", () => {
    const error = new PayGovError();

    expect(error).toBeInstanceOf(PayGovError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Failed to communicate with Pay.gov");
    expect(error.statusCode).toBe(504);
  });
});
