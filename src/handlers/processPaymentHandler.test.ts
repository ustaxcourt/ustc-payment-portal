import type { APIGatewayEvent } from "aws-lambda";
import {
	mockHeaders,
	mockRequestContext,
	resetCommonHandlerMocks,
} from "./handlerTestCommon";
import { processPaymentHandler } from "./processPaymentHandler";
import { ConflictError } from "@errors/conflict";
import { ForbiddenError } from "@errors/forbidden";
import { GoneError } from "@errors/gone";
import { NotFoundError } from "@errors/notFound";
import { PayGovError } from "@errors/payGovError";
import { processPayment } from "@useCases/processPayment";

jest.mock("../useCases/processPayment", () => ({
	processPayment: jest.fn(),
}));

const mockProcessPayment = processPayment as jest.MockedFunction<
	typeof processPayment
>;

beforeEach(() => {
	resetCommonHandlerMocks();
	mockProcessPayment.mockResolvedValue({
		paymentStatus: "success",
		transactions: [
			{
				payGovTrackingId: "track-123",
				transactionStatus: "processed",
				paymentMethod: "Credit/Debit Card",
				createdTimestamp: "2026-01-15T10:30:00Z",
				updatedTimestamp: "2026-01-15T10:35:00Z",
			},
		],
	} as never);
});

describe("processPaymentHandler", () => {
	it("returns 200 with v2 response shape on success", async () => {
		const event = {
			body: JSON.stringify({ token: crypto.randomUUID().replace(/-/g, "") }),
			headers: mockHeaders,
			requestContext: mockRequestContext,
		} as unknown as APIGatewayEvent;

		const result = await processPaymentHandler(event);

		expect(result.statusCode).toBe(200);
		const body = JSON.parse(result.body);
		expect(body).toHaveProperty("paymentStatus");
		expect(body).toHaveProperty("transactions");
	});

	it("returns 400 when body is missing", async () => {
		const event = {
			body: null,
			headers: mockHeaders,
			requestContext: mockRequestContext,
		} as unknown as APIGatewayEvent;

		const result = await processPaymentHandler(event);
		expect(result.statusCode).toBe(400);
		expect(JSON.parse(result.body).message).toBe("missing body");
	});

	it("returns 400 when body is malformed JSON", async () => {
		const event = {
			body: "{not json",
			headers: mockHeaders,
			requestContext: mockRequestContext,
		} as unknown as APIGatewayEvent;

		const result = await processPaymentHandler(event);
		expect(result.statusCode).toBe(400);
		expect(JSON.parse(result.body).message).toBe(
			"invalid JSON in request body",
		);
	});

	it("returns 400 when token is invalid", async () => {
		const event = {
			body: JSON.stringify({ token: "short" }),
			headers: mockHeaders,
			requestContext: mockRequestContext,
		} as unknown as APIGatewayEvent;

		const result = await processPaymentHandler(event);
		expect(result.statusCode).toBe(400);
		expect(JSON.parse(result.body).message).toBe("Validation error");
	});

	it("returns 404 when use case throws NotFoundError", async () => {
		const token = crypto.randomUUID().replace(/-/g, "");
		mockProcessPayment.mockRejectedValueOnce(
			new NotFoundError(`Transaction with token '${token}' could not be found`),
		);

		const event = {
			body: JSON.stringify({ token }),
			headers: mockHeaders,
			requestContext: mockRequestContext,
		} as unknown as APIGatewayEvent;

		const result = await processPaymentHandler(event);
		expect(result.statusCode).toBe(404);
	});

	it("returns 403 when use case throws ForbiddenError", async () => {
		mockProcessPayment.mockRejectedValueOnce(
			new ForbiddenError(
				"You do not have access to the transaction for the requested token",
			),
		);

		const event = {
			body: JSON.stringify({ token: crypto.randomUUID().replace(/-/g, "") }),
			headers: mockHeaders,
			requestContext: mockRequestContext,
		} as unknown as APIGatewayEvent;

		const result = await processPaymentHandler(event);
		expect(result.statusCode).toBe(403);
	});

	it("propagates PayGovError status when use case throws", async () => {
		mockProcessPayment.mockRejectedValueOnce(new PayGovError());

		const event = {
			body: JSON.stringify({ token: crypto.randomUUID().replace(/-/g, "") }),
			headers: mockHeaders,
			requestContext: mockRequestContext,
		} as unknown as APIGatewayEvent;

		const result = await processPaymentHandler(event);
		expect(result.statusCode).toBe(504);
	});

	it("returns 410 when use case throws GoneError", async () => {
		mockProcessPayment.mockRejectedValueOnce(
			new GoneError("This token is no longer valid."),
		);

		const event = {
			body: JSON.stringify({ token: crypto.randomUUID().replace(/-/g, "") }),
			headers: mockHeaders,
			requestContext: mockRequestContext,
		} as unknown as APIGatewayEvent;

		const result = await processPaymentHandler(event);
		expect(result.statusCode).toBe(410);
	});

	it("returns 409 when use case throws ConflictError", async () => {
		mockProcessPayment.mockRejectedValueOnce(
			new ConflictError(ConflictError.PAYMENT_IN_FLIGHT_MESSAGE),
		);

		const event = {
			body: JSON.stringify({ token: crypto.randomUUID().replace(/-/g, "") }),
			headers: mockHeaders,
			requestContext: mockRequestContext,
		} as unknown as APIGatewayEvent;

		const result = await processPaymentHandler(event);
		expect(result.statusCode).toBe(409);
		expect(JSON.parse(result.body).message).toContain(
			"already being processed",
		);
	});

	it("returns 500 when use case throws a generic error", async () => {
		mockProcessPayment.mockRejectedValueOnce(new Error("unexpected"));

		const event = {
			body: JSON.stringify({ token: crypto.randomUUID().replace(/-/g, "") }),
			headers: mockHeaders,
			requestContext: mockRequestContext,
		} as unknown as APIGatewayEvent;

		const result = await processPaymentHandler(event);
		expect(result.statusCode).toBe(500);
	});

	it("returns 403 when IAM principal is invalid", async () => {
		const event = {
			body: JSON.stringify({ token: crypto.randomUUID().replace(/-/g, "") }),
			headers: mockHeaders,
			requestContext: {
				...mockRequestContext,
				identity: {
					userArn: "not-a-valid-arn",
				},
			},
		} as unknown as APIGatewayEvent;

		const result = await processPaymentHandler(event);

		expect(result.statusCode).toBe(403);
	});
});
