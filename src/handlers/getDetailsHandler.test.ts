import { APIGatewayEvent } from "aws-lambda";
import {
  mockHeaders,
  mockRequestContext,
  resetCommonHandlerMocks,
} from "./handlerTestCommon";
import { getDetailsHandler } from "./getDetailsHandler";
import { ForbiddenError } from "@errors/forbidden";
import { NotFoundError } from "@errors/notFound";
import { getDetails } from "@useCases/getDetails";

jest.mock("../useCases/getDetails", () => ({
  getDetails: jest.fn(),
}));

const mockGetDetails = getDetails as jest.MockedFunction<typeof getDetails>;

beforeEach(() => {
  resetCommonHandlerMocks();
  mockRequestContext.httpMethod = "GET";
  mockRequestContext.path = "/details";
  mockRequestContext.resourcePath = "/details";
  mockGetDetails.mockResolvedValue({
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

describe("getDetailsHandler", () => {
  const validUuid = "550e8400-e29b-41d4-a716-446655440000";

  it("returns 200 with response shape on a valid UUID", async () => {
    const event = {
      pathParameters: { transactionReferenceId: validUuid },
      headers: mockHeaders,
      requestContext: mockRequestContext,
    } as unknown as APIGatewayEvent;

    const result = await getDetailsHandler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toHaveProperty("paymentStatus");
    expect(body).toHaveProperty("transactions");
  });

  it("returns 400 when transactionReferenceId is not a valid UUID", async () => {
    const event = {
      pathParameters: { transactionReferenceId: "not-a-uuid" },
      headers: mockHeaders,
      requestContext: mockRequestContext,
    } as unknown as APIGatewayEvent;

    const result = await getDetailsHandler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("Validation error");
    expect(JSON.parse(result.body).errors[0].message).toBe("Invalid UUID");
  });

  it("returns 400 when pathParameters are missing", async () => {
    const event = {
      pathParameters: undefined,
      headers: mockHeaders,
      requestContext: mockRequestContext,
    } as unknown as APIGatewayEvent;

    const result = await getDetailsHandler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("Validation error");
    expect(JSON.parse(result.body).errors[0].message).toBe(
      "Invalid input: expected string, received null",
    );
  });

  it("returns 404 when use case throws NotFoundError", async () => {
    mockGetDetails.mockRejectedValueOnce(
      new NotFoundError("Transaction Reference Id was not found"),
    );

    const event = {
      pathParameters: { transactionReferenceId: validUuid },
      headers: mockHeaders,
      requestContext: mockRequestContext,
    } as unknown as APIGatewayEvent;

    const result = await getDetailsHandler(event);
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe(
      "Transaction Reference Id was not found",
    );
  });

  it("returns 403 when use case throws ForbiddenError", async () => {
    mockGetDetails.mockRejectedValueOnce(
      new ForbiddenError(
        "You are not authorized to get details for this transaction.",
      ),
    );

    const event = {
      pathParameters: { transactionReferenceId: validUuid },
      headers: mockHeaders,
      requestContext: mockRequestContext,
    } as unknown as APIGatewayEvent;

    const result = await getDetailsHandler(event);
    expect(result.statusCode).toBe(403);
  });

  it("returns 403 when IAM principal is missing", async () => {
    const event = {
      pathParameters: { transactionReferenceId: validUuid },
      headers: mockHeaders,
      requestContext: {
        ...mockRequestContext,
        identity: {
          userArn: null,
        },
      },
    } as unknown as APIGatewayEvent;

    const result = await getDetailsHandler(event);

    expect(result.statusCode).toBe(403);
  });
});
