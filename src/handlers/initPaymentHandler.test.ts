import { APIGatewayEvent } from "aws-lambda";
import {
  mockHeaders,
  mockRequestContext,
  resetCommonHandlerMocks,
} from "./handlerTestCommon";
import { initPaymentHandler } from "./initPaymentHandler";
import { ConflictError } from "@errors/conflict";
import { ForbiddenError } from "@errors/forbidden";
import { initPayment } from "@useCases/initPayment";

jest.mock("../useCases/initPayment", () => ({
  initPayment: jest.fn(),
}));

const mockInitPayment = initPayment as jest.MockedFunction<typeof initPayment>;

beforeEach(() => {
  resetCommonHandlerMocks();
  mockInitPayment.mockResolvedValue({ token: "test-token-123" } as never);
});

describe("initPaymentHandler", () => {
  it("returns 200 with token on successful request", async () => {
    const event = {
      body: JSON.stringify({
        transactionReferenceId: "550e8400-e29b-41d4-a716-446655440000",
        fee: "PETITION_FILING_FEE",
        urlSuccess: "https://example.com/success",
        urlCancel: "https://example.com/cancel",
        metadata: { docketNumber: "123-26" },
      }),
      headers: mockHeaders,
      requestContext: mockRequestContext,
    } as unknown as APIGatewayEvent;

    const result = await initPaymentHandler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toHaveProperty("token");
    expect(mockInitPayment).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when request schema validation fails", async () => {
    const event = {
      body: JSON.stringify({ fee: "PETITION_FILING_FEE" }),
      headers: mockHeaders,
      requestContext: mockRequestContext,
    } as unknown as APIGatewayEvent;

    const result = await initPaymentHandler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("Validation error");
  });

  it("returns 400 when body is missing", async () => {
    const event = {
      body: null,
      headers: mockHeaders,
      requestContext: mockRequestContext,
    } as unknown as APIGatewayEvent;

    const result = await initPaymentHandler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("missing body");
  });

  it("returns 403 when IAM principal is missing", async () => {
    const event = {
      body: JSON.stringify({
        transactionReferenceId: "550e8400-e29b-41d4-a716-446655440000",
        fee: "PETITION_FILING_FEE",
        urlSuccess: "https://example.com/success",
        urlCancel: "https://example.com/cancel",
        metadata: { docketNumber: "123-26" },
      }),
      headers: mockHeaders,
      requestContext: {
        ...mockRequestContext,
        identity: {},
      },
    } as unknown as APIGatewayEvent;

    const result = await initPaymentHandler(event);

    expect(result.statusCode).toBe(403);
  });

  it("returns 403 when use case throws ForbiddenError", async () => {
    mockInitPayment.mockRejectedValueOnce(
      new ForbiddenError("Client not authorized for fee"),
    );

    const event = {
      body: JSON.stringify({
        transactionReferenceId: "550e8400-e29b-41d4-a716-446655440000",
        fee: "NONATTORNEY_EXAM_REGISTRATION_FEE",
        urlSuccess: "https://example.com/success",
        urlCancel: "https://example.com/cancel",
        metadata: {
          email: "test@example.com",
          fullName: "Test User",
          accessCode: "ABC123",
        },
      }),
      headers: mockHeaders,
      requestContext: mockRequestContext,
    } as unknown as APIGatewayEvent;

    const result = await initPaymentHandler(event);

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).message).toBe(
      "Client not authorized for fee",
    );
  });

  it("returns 409 when use case throws ConflictError", async () => {
    mockInitPayment.mockRejectedValueOnce(
      new ConflictError(
        "A payment session is already initiated for this transactionReferenceId",
      ),
    );

    const event = {
      body: JSON.stringify({
        transactionReferenceId: "550e8400-e29b-41d4-a716-446655440000",
        fee: "PETITION_FILING_FEE",
        urlSuccess: "https://example.com/success",
        urlCancel: "https://example.com/cancel",
        metadata: { docketNumber: "123-26" },
      }),
      headers: mockHeaders,
      requestContext: mockRequestContext,
    } as unknown as APIGatewayEvent;

    const result = await initPaymentHandler(event);

    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body).message).toContain("already initiated");
  });
});
