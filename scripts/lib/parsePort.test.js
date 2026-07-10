const { parsePort } = require("./parsePort");

describe("parsePort", () => {
	it("returns the fallback when value is null", () => {
		expect(parsePort(null, 8080, "PORT")).toBe(8080);
	});

	it("returns the fallback when value is undefined", () => {
		expect(parsePort(undefined, 8080, "PORT")).toBe(8080);
	});

	it("returns the fallback when value is an empty string", () => {
		expect(parsePort("", 8080, "PORT")).toBe(8080);
	});

	it("parses a valid numeric string", () => {
		expect(parsePort("3000", 8080, "PORT")).toBe(3000);
	});

	it("accepts a numeric value directly", () => {
		expect(parsePort(5432, 8080, "PORT")).toBe(5432);
	});

	it("accepts the minimum valid port (1)", () => {
		expect(parsePort("1", 8080, "PORT")).toBe(1);
	});

	it("accepts the maximum valid port (65535)", () => {
		expect(parsePort("65535", 8080, "PORT")).toBe(65535);
	});

	it("throws on port 0", () => {
		expect(() => parsePort("0", 8080, "MY_PORT")).toThrow("Invalid MY_PORT");
	});

	it("throws on port 65536", () => {
		expect(() => parsePort("65536", 8080, "MY_PORT")).toThrow(
			"Invalid MY_PORT",
		);
	});

	it("throws on a negative value", () => {
		expect(() => parsePort("-1", 8080, "MY_PORT")).toThrow("Invalid MY_PORT");
	});

	it("throws on a non-numeric string", () => {
		expect(() => parsePort("abc", 8080, "MY_PORT")).toThrow("Invalid MY_PORT");
	});

	it("throws on a float", () => {
		expect(() => parsePort("3000.5", 8080, "MY_PORT")).toThrow(
			"Invalid MY_PORT",
		);
	});

	it("includes the env var name and value in the error message", () => {
		expect(() => parsePort("0", 8080, "API_PORT")).toThrow(
			"Invalid API_PORT: 0. Expected integer 1-65535.",
		);
	});
});
