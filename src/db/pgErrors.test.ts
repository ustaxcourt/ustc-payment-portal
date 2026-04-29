import { isUniqueViolation } from "./pgErrors";

describe("isUniqueViolation", () => {
  it("returns true when err.code is '23505'", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("returns true when err.nativeError.code is '23505' (objection wrapping)", () => {
    expect(isUniqueViolation({ nativeError: { code: "23505" } })).toBe(true);
  });

  it("returns false for any other pg SQLSTATE", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false); // foreign_key_violation
    expect(isUniqueViolation({ code: "23502" })).toBe(false); // not_null_violation
  });

  it("returns false when neither code field is present", () => {
    expect(isUniqueViolation(new Error("plain error"))).toBe(false);
    expect(isUniqueViolation({})).toBe(false);
  });

  it("returns false for non-object inputs", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
    expect(isUniqueViolation(23505)).toBe(false);
  });
});
