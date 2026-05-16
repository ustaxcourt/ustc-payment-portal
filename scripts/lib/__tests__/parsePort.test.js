const { parsePort } = require("../parsePort");

describe("parsePort", () => {
  it("parses a valid numeric string into an integer", () => {
    expect(parsePort("8080", 3000, "API_PORT")).toBe(8080);
  });

  it("accepts a number value directly", () => {
    expect(parsePort(5433, 5432, "DB_PORT")).toBe(5433);
  });

  it("falls back to the default when value is undefined", () => {
    expect(parsePort(undefined, 3366, "PAY_GOV_TEST_SERVER_PORT")).toBe(3366);
  });

  it("falls back to the default when value is an empty string", () => {
    // Some shells surface unset env vars as "" rather than undefined.
    expect(parsePort("", 8080, "API_PORT")).toBe(8080);
  });

  it("throws with the env name in the message when value is non-numeric", () => {
    expect(() => parsePort("not-a-port", 8080, "API_PORT")).toThrow(
      /Invalid API_PORT: not-a-port/,
    );
  });

  it("throws on values outside the valid TCP port range", () => {
    expect(() => parsePort("0", 8080, "API_PORT")).toThrow(/Invalid API_PORT/);
    expect(() => parsePort("65536", 8080, "API_PORT")).toThrow(
      /Invalid API_PORT/,
    );
  });

  it("throws on non-integer decimal values", () => {
    expect(() => parsePort("8080.5", 8080, "API_PORT")).toThrow(
      /Invalid API_PORT/,
    );
  });
});
