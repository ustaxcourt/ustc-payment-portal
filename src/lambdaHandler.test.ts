import {
  initPaymentHandler,
  processPaymentHandler,
  getDetailsHandler,
} from "./lambdaHandler";
import { APIGatewayEvent } from "aws-lambda";
import { ForbiddenError } from "./errors/forbidden";
import { GoneError } from "./errors/gone";
import { PayGovError } from "./errors/payGovError";
import { NotFoundError } from "./errors/notFound";

// Reusable mock for appContext with dynamic use case injection
const useCasesMock = {
  initPayment: jest.fn().mockResolvedValue({ token: "test-token-123" }),
  processPayment: jest.fn().mockResolvedValue({
    paymentStatus: "success",
    transactions: [
      {
        payGovTrackingId: "track-123",
        transactionStatus: "processed",
        paymentMethod: "Credit/Debit Card",
        returnDetail: undefined,
        createdTimestamp: "2026-01-15T10:30:00Z",
        updatedTimestamp: "2026-01-15T10:35:00Z",
      },
    ],
  }),
  getDetails: jest.fn().mockResolvedValue({
    trackingId: "track-123",
    transactionStatus: "processed",
  }),
};

jest.mock("./appContext", () => ({
  createAppContext: jest.fn(() => ({
    getHttpsAgent: jest.fn(),
    postHttpRequest: jest.fn()
      .mockResolvedValue(`<?xml version="1.0" encoding="UTF-8"?>
      <S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
        <S:Header>
          <WorkContext xmlns="http://oracle.com/weblogic/soap/workarea/">blah=</WorkContext>
        </S:Header>
        <S:Body>
          <ns2:startOnlineCollectionResponse xmlns:ns2="http://fms.treas.gov/services/tcsonline_3_1">
            <startOnlineCollectionResponse>
              <token>test-token-123</token>
            </startOnlineCollectionResponse>
          </ns2:startOnlineCollectionResponse>
        </S:Body>
      </S:Envelope>`),
    getUseCases: () => useCasesMock,
  })),
}));

// Mock permissionsClient to return valid permissions for test role
jest.mock("./clients/permissionsClient", () => ({
  getClientByRoleArn: jest.fn().mockResolvedValue({
    clientName: "Test Client",
    clientRoleArn: "arn:aws:iam::123456789012:role/dawson-client",
    allowedFeeIds: ["PETITION_FILING_FEE"],
  }),
  clearPermissionsCache: jest.fn(),
}));

const mockRequestContext = {
  identity: {
    userArn: "arn:aws:sts::123456789012:assumed-role/dawson-client/session-123",
  },
  accountId: "123456789012",
  apiId: "test-api",
  authorizer: {},
  httpMethod: "POST",
  path: "/test",
  protocol: "HTTP/1.1",
  requestId: "test-request-id",
  requestTimeEpoch: Date.now(),
  resourceId: "test-resource",
  resourcePath: "/test",
  stage: "test",
};

const mockHeaders = {
  "Content-Type": "application/json",
};

describe("lambdaHandler", () => {
  describe("initPaymentHandler", () => {
    it("returns 200 with token on successful request and client", async () => {
      const mockInitPayment = jest
        .fn()
        .mockResolvedValue({ token: "test-token-123" });
      useCasesMock.initPayment = mockInitPayment;

      const event = {
        body: JSON.stringify({
          transactionReferenceId: "550e8400-e29b-41d4-a716-446655440000",
          feeId: "PETITION_FILING_FEE",
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
      // Check that client was passed to use case with correct clientName from mocked permissionsClient
      const calledWith = mockInitPayment.mock.calls[0][1];
      expect(calledWith.client.clientName).toBe("Test Client");
    });

    it("returns 400 with structured errors array when request schema validation fails", async () => {
      const event = {
        body: JSON.stringify({ feeId: "PETITION_FILING_FEE" }), // missing required fields
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await initPaymentHandler(event);
      expect(result.statusCode).toBe(400);

      const body = JSON.parse(result.body);
      expect(body.message).toBe("Validation error");
      expect(Array.isArray(body.errors)).toBe(true);
      expect(body.errors.length).toBeGreaterThan(0);
      expect(body.errors[0]).toHaveProperty("path");
      expect(body.errors[0]).toHaveProperty("message");
    });

    it("returns 400 with JSON body when body is missing", async () => {
      const event = {
        body: null,
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await initPaymentHandler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toHaveProperty("message");
    });

    it("returns 400 with JSON body when body is undefined", async () => {
      const event = {
        body: undefined,
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await initPaymentHandler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toHaveProperty("message");
    });

    it("returns 403 when IAM principal is missing", async () => {
      const event = {
        body: JSON.stringify({
          transactionReferenceId: "550e8400-e29b-41d4-a716-446655440000",
          feeId: "PETITION_FILING_FEE",
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

    it("returns 403 when feeId is not in client allowedFeeIds", async () => {
      const event = {
        body: JSON.stringify({
          transactionReferenceId: "550e8400-e29b-41d4-a716-446655440000",
          feeId: "NONATTORNEY_EXAM_REGISTRATION_FEE",
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
        "Client not authorized for feeId",
      );
    });
  });

  describe("processPaymentHandler", () => {
    it("returns 200 with v2 response shape on successful request", async () => {
      const event = {
        body: JSON.stringify({
          token: crypto.randomUUID().replace(/-/g, ""),
        }),
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await processPaymentHandler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toHaveProperty("paymentStatus");
      expect(body).toHaveProperty("transactions");
      expect(body.paymentStatus).toBe("success");
      expect(body.transactions).toHaveLength(1);
      expect(body.transactions[0].transactionStatus).toBe("processed");
    });

    it("returns 400 with JSON body when body is missing", async () => {
      const event = {
        body: null,
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await processPaymentHandler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain("missing body");
      expect(Array.isArray(body.errors)).toBe(true);
    });

    it("returns 400 when body is an empty string", async () => {
      const event = {
        body: "",
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await processPaymentHandler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain("missing body");
    });

    it("returns 400 when body is malformed JSON", async () => {
      const event = {
        body: "{not json",
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await processPaymentHandler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain("invalid JSON");
    });

    it("returns 400 when required token field is missing", async () => {
      const event = {
        body: JSON.stringify({}),
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await processPaymentHandler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toBe("Validation error");
      expect(Array.isArray(body.errors)).toBe(true);
      expect(body.errors.length).toBeGreaterThan(0);
      expect(body.errors[0].path).toContain("token");
    });

    it("returns 400 when token is wrong type", async () => {
      const event = {
        body: JSON.stringify({ token: 123 }),
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await processPaymentHandler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe("Validation error");
    });

    it("returns 400 when token is an empty string", async () => {
      const event = {
        body: JSON.stringify({ token: "" }),
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await processPaymentHandler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe("Validation error");
    });

    it("returns 400 when token is too short (under 32 chars)", async () => {
      const event = {
        body: JSON.stringify({ token: "short" }),
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await processPaymentHandler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe("Validation error");
    });

    it("returns 400 when token is too long (over 32 chars)", async () => {
      const event = {
        body: JSON.stringify({
          token: `${crypto.randomUUID().replace(/-/g, "")}abcd`,
        }),
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await processPaymentHandler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe("Validation error");
    });

    it("returns 400 when request has unknown fields (strict mode)", async () => {
      const event = {
        body: JSON.stringify({
          token: crypto.randomUUID().replace(/-/g, ""),
          extra: true,
        }),
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await processPaymentHandler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toBe("Validation error");
      expect(body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "unrecognized_keys",
            keys: expect.arrayContaining(["extra"]),
          }),
        ]),
      );
    });

    it("returns 404 when token is not found", async () => {
      const token = crypto.randomUUID().replace(/-/g, "");
      useCasesMock.processPayment.mockRejectedValueOnce(
        new NotFoundError(
          `Transaction with token '${token}' could not be found`,
        ),
      );

      const event = {
        body: JSON.stringify({ token }),
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await processPaymentHandler(event);
      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toContain("could not be found");
    });

    it("returns 403 when client does not have access to the transaction", async () => {
      useCasesMock.processPayment.mockRejectedValueOnce(
        new ForbiddenError(
          `You do not have access to the transaction for the requested token`,
        ),
      );

      const event = {
        body: JSON.stringify({ token: crypto.randomUUID().replace(/-/g, "") }),
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await processPaymentHandler(event);
      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toContain("do not have access");
    });

    it("propagates PayGovError status when use case throws", async () => {
      useCasesMock.processPayment.mockRejectedValueOnce(new PayGovError());

      const event = {
        body: JSON.stringify({ token: crypto.randomUUID().replace(/-/g, "") }),
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await processPaymentHandler(event);
      expect(result.statusCode).toBe(504);
    });

    it("returns 410 when use case throws GoneError", async () => {
      useCasesMock.processPayment.mockRejectedValueOnce(
        new GoneError("This token is no longer valid."),
      );

      const event = {
        body: JSON.stringify({ token: crypto.randomUUID().replace(/-/g, "") }),
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await processPaymentHandler(event);
      expect(result.statusCode).toBe(410);
      expect(JSON.parse(result.body).message).toContain("no longer valid");
    });

    it("returns 500 when use case throws a generic error", async () => {
      useCasesMock.processPayment.mockRejectedValueOnce(
        new Error("unexpected"),
      );

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

  describe("getDetailsHandler", () => {
    it("returns 200 without feeId in path params — IAM registration check is sufficient", async () => {
      const event = {
        pathParameters: {
          payGovTrackingId: "tracking-123",
        },
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await getDetailsHandler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toHaveProperty("trackingId");
      expect(body).toHaveProperty("transactionStatus");
    });

    it("returns 400 with JSON body when pathParameters are missing", async () => {
      const event = {
        pathParameters: null,
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await getDetailsHandler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toHaveProperty("message");
    });

    it("returns 400 with JSON body when pathParameters are undefined", async () => {
      const event: APIGatewayEvent = {
        pathParameters: undefined,
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await getDetailsHandler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toHaveProperty("message");
    });

    it("returns 403 when IAM principal is missing", async () => {
      const event = {
        pathParameters: { payGovTrackingId: "123" },
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
});
