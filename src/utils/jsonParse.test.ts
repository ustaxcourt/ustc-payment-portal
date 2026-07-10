import { jsonParse } from "./jsonParse";
import { InvalidRequestError } from "@errors/invalidRequest";

describe("jsonParse", () => {
	it("returns parsed JSON for a valid body", () => {
		const result = jsonParse<{ token: string }>(
			JSON.stringify({ token: "abc123" }),
		);

		expect(result).toEqual({ ok: true, value: { token: "abc123" } });
	});

	it("throws InvalidRequestError when body is null", () => {
		expect(() => jsonParse(null)).toThrow(InvalidRequestError);
		expect(() => jsonParse(null)).toThrow("missing body");
	});

	it("throws InvalidRequestError when body is undefined", () => {
		expect(() => jsonParse(undefined)).toThrow(InvalidRequestError);
		expect(() => jsonParse(undefined)).toThrow("missing body");
	});

	it("throws InvalidRequestError when body is invalid JSON", () => {
		expect(() => jsonParse("not-json")).toThrow(InvalidRequestError);
		expect(() => jsonParse("not-json")).toThrow("invalid JSON in request body");
	});
});
