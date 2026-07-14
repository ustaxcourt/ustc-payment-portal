import { PayGovError } from "./payGovError";

describe("PayGovError", () => {
	it("has statusCode 504", () => {
		const err = new PayGovError();
		expect(err.statusCode).toBe(504);
	});

	it("uses the default message when none is provided", () => {
		const err = new PayGovError();
		expect(err.message).toBe("Error communicating with Pay.gov");
	});

	it("uses a custom message when provided", () => {
		const err = new PayGovError("Custom Pay.gov error");
		expect(err.message).toBe("Custom Pay.gov error");
	});

	it("is an instance of Error", () => {
		const err = new PayGovError();
		expect(err).toBeInstanceOf(Error);
	});

	it("defaults to statusCode 504 when none provided (back-compat)", () => {
		expect(new PayGovError().statusCode).toBe(504);
		expect(new PayGovError("msg").statusCode).toBe(504);
	});

	it("accepts a custom statusCode", () => {
		const err = new PayGovError("retry", 500);
		expect(err.statusCode).toBe(500);
		expect(err.message).toBe("retry");
	});
});
