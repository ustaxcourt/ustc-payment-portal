import { StartOnlineCollectionResponseSchema } from "./StartOnlineCollectionResponse.schema";

const validToken = crypto.randomUUID().replace(/-/g, "");

describe("StartOnlineCollectionResponseSchema", () => {
  it("accepts a valid 32-character Pay.gov token", () => {
    const result = StartOnlineCollectionResponseSchema.safeParse({
      token: validToken,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a response missing the token field", () => {
    const result = StartOnlineCollectionResponseSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects an empty-string token", () => {
    const result = StartOnlineCollectionResponseSchema.safeParse({ token: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a token shorter than 32 characters", () => {
    const result = StartOnlineCollectionResponseSchema.safeParse({
      token: validToken.slice(0, 31),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a token longer than 32 characters", () => {
    const result = StartOnlineCollectionResponseSchema.safeParse({
      token: validToken + "x",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a null token", () => {
    const result = StartOnlineCollectionResponseSchema.safeParse({
      token: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-string token", () => {
    const result = StartOnlineCollectionResponseSchema.safeParse({
      token: 12345,
    });
    expect(result.success).toBe(false);
  });

  it("accepts extra unknown fields (forward-compatible with Pay.gov additions)", () => {
    const result = StartOnlineCollectionResponseSchema.safeParse({
      token: validToken,
      futureFieldFromPayGov: "whatever",
    });
    expect(result.success).toBe(true);
  });

  // Whitespace is preserved — Pay.gov-issued IDs have historically carried
  // embedded spaces; do not trim or reject them.
  it.each([
    [" " + validToken.slice(0, 31), "leading space"],
    [validToken.slice(0, 31) + " ", "trailing space"],
    [validToken.slice(0, 15) + " " + validToken.slice(16), "internal space"],
    [" ".repeat(32), "all spaces"],
  ])("accepts a 32-character token containing whitespace (%s)", (token) => {
    const result = StartOnlineCollectionResponseSchema.safeParse({ token });
    expect(result.success).toBe(true);
    expect(result.data?.token).toBe(token);
  });
});
