import { StartOnlineCollectionResponseSchema } from "./StartOnlineCollectionResponse.schema";

// Pay.gov tokens are exactly 32 characters. See the schema file for context.
const validToken = "a".repeat(32);

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
      token: "a".repeat(31),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a token longer than 32 characters", () => {
    const result = StartOnlineCollectionResponseSchema.safeParse({
      token: "a".repeat(33),
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
    [" " + "a".repeat(31), "leading space"],
    ["a".repeat(31) + " ", "trailing space"],
    ["a".repeat(15) + " " + "a".repeat(16), "internal space"],
    [" ".repeat(32), "all spaces"],
  ])("accepts a 32-character token containing whitespace (%s)", (token) => {
    const result = StartOnlineCollectionResponseSchema.safeParse({ token });
    expect(result.success).toBe(true);
    expect(result.data?.token).toBe(token);
  });
});
