import {
  initPaymentHandler,
  processPaymentHandler,
  getDetailsHandler,
} from "./lambdaHandler";
import { APIGatewayEvent } from "aws-lambda";

// Mock the appContext module
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
    getUseCases: () => ({
      initPayment: jest.fn().mockResolvedValue({ token: "test-token-123" }),
      processPayment: jest.fn().mockResolvedValue({
        trackingId: "track-123",
        transactionStatus: "Success",
      }),
      getDetails: jest.fn().mockResolvedValue({
        trackingId: "track-123",
        transactionStatus: "Success",
      }),
    }),
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
    it("returns 200 with token on successful request", async () => {
      const event = {
        body: JSON.stringify({
          transactionAmount: 100,
          urlCancel: "http://cancel.com",
          urlSuccess: "http://success.com",
          agencyTrackingId: "agency-123",
          feeId: "PETITION_FILING_FEE",
        }),
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await initPaymentHandler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toHaveProperty("token");
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
        body: JSON.stringify({ feeId: "PETITION_FILING_FEE" }),
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
        body: JSON.stringify({ feeId: "UNAUTHORIZED_FEE" }),
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await initPaymentHandler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe("Client not authorized for feeId");
    });
  });

  describe("processPaymentHandler", () => {
    it("returns 200 with transaction details on successful request", async () => {
      const event = {
        body: JSON.stringify({
          token: "payment-token",
        }),
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await processPaymentHandler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toHaveProperty("trackingId");
      expect(body).toHaveProperty("transactionStatus");
    });

    it("returns 400 with JSON body when body is missing", async () => {
      const event = {
        body: null,
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await processPaymentHandler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toHaveProperty("message");
    });

    it("returns 403 when IAM principal is invalid", async () => {
      const event = {
        body: JSON.stringify({ feeId: "PETITION_FILING_FEE" }),
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
