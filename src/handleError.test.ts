import { handleError } from "./handleError";
import { z } from "zod";
import type { AppContext } from "@appTypes/AppContext";
import { PayGovError } from "@errors/payGovError";
import { ServerError } from "@errors/serverError";

const mockAppContext = {
	logger: {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	},
} as unknown as AppContext;

describe("handleError", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("returns the statusCode and message for known client errors (< 500)", () => {
		const result = handleError(mockAppContext, {
			statusCode: 403,
			message: "Forbidden",
		});
		expect(result.statusCode).toBe(403);
		expect(JSON.parse(result.body).message).toBe("Forbidden");
	});

	it("returns 500 with a generic message for known server errors (>= 500, no custom message provided)", () => {
		const result = handleError(mockAppContext, { statusCode: 500 });
		expect(result.statusCode).toBe(500);
		expect(JSON.parse(result.body).message).toBe(
			"An unexpected error occurred while processing the request",
		);
	});

	it("returns 500 with the ServerError message when a ServerError is thrown", () => {
		const result = handleError(
			mockAppContext,
			new ServerError(
				"Failed to record payment session. Please retry your transaction.",
			),
		);
		expect(result.statusCode).toBe(500);
		expect(JSON.parse(result.body).message).toBe(
			"Failed to record payment session. Please retry your transaction.",
		);
	});

	it("returns 500 with the generic fallback message for unrecognized errors, not leaking internal details", () => {
		const result = handleError(
			mockAppContext,
			new Error("internal knex detail"),
		);
		expect(result.statusCode).toBe(500);
		expect(JSON.parse(result.body).message).toBe(
			"An unexpected error occurred while processing the request",
		);
	});

	it("returns 400 with validation details for ZodErrors", () => {
		const schema = z.object({ trackingId: z.string() });
		const { error } = schema.safeParse({});

		const result = handleError(mockAppContext, error!);
		expect(result.statusCode).toBe(400);

		const body = JSON.parse(result.body);
		expect(body.message).toBe("Validation error");
		expect(body.errors).toHaveLength(1);
		expect(body.errors[0].path).toContain("trackingId");
	});

	it("returns 504 with Pay.gov error message for PayGovError", () => {
		const result = handleError(mockAppContext, new PayGovError());
		expect(result.statusCode).toBe(504);
		expect(JSON.parse(result.body).message).toBe(
			"Error communicating with Pay.gov",
		);
	});

	it("returns the PayGovError statusCode when overridden (e.g. 500)", () => {
		const result = handleError(
			mockAppContext,
			new PayGovError("Please retry", 500),
		);
		expect(result.statusCode).toBe(500);
		expect(JSON.parse(result.body).message).toBe("Please retry");
	});

	describe("structured logging", () => {
		it("emits logger.error with statusCode for 5xx responses (drives the *-5xx-critical alarm)", () => {
			handleError(mockAppContext, new ServerError("DB unreachable"));
			expect(mockAppContext.logger.error).toHaveBeenCalledWith(
				"Lambda handler returned a server error",
				expect.objectContaining({
					statusCode: 500,
					errorMessage: "DB unreachable",
				}),
			);
			expect(mockAppContext.logger.warn).not.toHaveBeenCalled();
		});

		it("emits logger.warn (not error) for 4xx responses to keep alarms quiet", () => {
			handleError(mockAppContext, { statusCode: 403, message: "Forbidden" });
			expect(mockAppContext.logger.warn).toHaveBeenCalledWith(
				"Lambda handler returned a client error",
				expect.objectContaining({
					statusCode: 403,
					errorMessage: "Forbidden",
				}),
			);
			expect(mockAppContext.logger.error).not.toHaveBeenCalled();
		});

		it("extracts errorMessage from plain object shapes (e.g. {statusCode, message})", () => {
			handleError(mockAppContext, {
				statusCode: 502,
				message: "Upstream timeout",
			});
			expect(mockAppContext.logger.error).toHaveBeenCalledWith(
				"Lambda handler returned a server error",
				expect.objectContaining({ errorMessage: "Upstream timeout" }),
			);
		});

		it("includes errorStack for Error instances to aid CloudWatch triage", () => {
			handleError(mockAppContext, new Error("boom"));
			expect(mockAppContext.logger.error).toHaveBeenCalledWith(
				"Lambda handler returned a server error",
				expect.objectContaining({
					errorMessage: "boom",
					errorStack: expect.stringContaining("Error: boom"),
				}),
			);
		});

		it("falls back to String() for primitives without a .message field", () => {
			handleError(mockAppContext, "a string error");
			expect(mockAppContext.logger.error).toHaveBeenCalledWith(
				"Lambda handler returned a server error",
				expect.objectContaining({ errorMessage: "a string error" }),
			);
		});

		it("emits logger.warn for ZodError (validation = 4xx)", () => {
			const schema = z.object({ trackingId: z.string() });
			const { error } = schema.safeParse({});
			handleError(mockAppContext, error!);
			expect(mockAppContext.logger.warn).toHaveBeenCalledWith(
				"Lambda handler returned a client error",
				expect.objectContaining({ statusCode: 400 }),
			);
			expect(mockAppContext.logger.error).not.toHaveBeenCalled();
		});

		it("emits logger.error for unrecognized errors (falls through to 500)", () => {
			handleError(mockAppContext, new Error("internal knex detail"));
			expect(mockAppContext.logger.error).toHaveBeenCalledWith(
				"Lambda handler returned a server error",
				expect.objectContaining({
					statusCode: 500,
					errorName: "Error",
					errorMessage: "internal knex detail",
				}),
			);
		});
	});
});
