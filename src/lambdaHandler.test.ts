import {
  initPaymentHandler,
  processPaymentHandler,
  getDetailsHandler,
} from "./lambdaHandler";
import { APIGatewayEvent } from "aws-lambda";
import { InvalidRequestError } from "./errors/invalidRequest";

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

const mockHeaders = {
  Authentication: `Bearer test-token`,
};

describe("lambdaHandler", () => {
  let tempEnv: any;

  beforeAll(() => {
    tempEnv = process.env;
    process.env.API_ACCESS_TOKEN = "test-token";
  });

  afterAll(() => {
    process.env = tempEnv;
  });

  describe("initPaymentHandler", () => {
    it("returns 200 with token on successful request", async () => {
      const event = {
        body: JSON.stringify({
          tcsAppId: "test-app",
          transactionAmount: 100,
          urlCancel: "http://cancel.com",
          urlSuccess: "http://success.com",
          agencyTrackingId: "agency-123",
        }),
        headers: mockHeaders,
      } as unknown as APIGatewayEvent;

      const result = await initPaymentHandler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toHaveProperty("token");
    });

    it("returns 400 error when body is missing", () => {
      const event = {
        body: null,
        headers: mockHeaders,
      } as unknown as APIGatewayEvent;

      expect(() => initPaymentHandler(event)).toThrow(InvalidRequestError);
    });

    it("returns 400 error when body is undefined", () => {
      const event = {
        body: undefined,
        headers: mockHeaders,
      } as unknown as APIGatewayEvent;

      expect(() => initPaymentHandler(event)).toThrow(InvalidRequestError);
    });

    it("handles authorization errors", async () => {
      const event = {
        body: JSON.stringify({ test: "data" }),
        headers: { Authentication: "Bearer wrong-token" },
      } as unknown as APIGatewayEvent;

      const result = await initPaymentHandler(event);

      expect(result.statusCode).toBe(403);
    });
  });

  describe("processPaymentHandler", () => {
    it("returns 200 with transaction details on successful request", async () => {
      const event = {
        body: JSON.stringify({
          appId: "test-app",
          token: "payment-token",
        }),
        headers: mockHeaders,
      } as unknown as APIGatewayEvent;

      const result = await processPaymentHandler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toHaveProperty("trackingId");
      expect(body).toHaveProperty("transactionStatus");
    });

    it("returns 400 error when body is missing", () => {
      const event = {
        body: null,
        headers: mockHeaders,
      } as unknown as APIGatewayEvent;

      expect(() => processPaymentHandler(event)).toThrow(InvalidRequestError);
    });

    it("handles authorization errors", async () => {
      const event = {
        body: JSON.stringify({ test: "data" }),
        headers: { Authentication: "Bearer wrong-token" },
      } as unknown as APIGatewayEvent;

      const result = await processPaymentHandler(event);

      expect(result.statusCode).toBe(403);
    });
  });

  describe("getDetailsHandler", () => {
    it("returns 200 with transaction details on successful request", async () => {
      const event = {
        pathParameters: {
          appId: "test-app",
          payGovTrackingId: "tracking-123",
        },
        headers: mockHeaders,
      } as unknown as APIGatewayEvent;

      const result = await getDetailsHandler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toHaveProperty("trackingId");
      expect(body).toHaveProperty("transactionStatus");
    });

    it("returns 400 error when pathParameters are missing", () => {
      const event = {
        pathParameters: null,
        headers: mockHeaders,
      } as unknown as APIGatewayEvent;

      expect(() => getDetailsHandler(event)).toThrow(InvalidRequestError);
    });

    it("returns 400 error when pathParameters are undefined", () => {
      const event: APIGatewayEvent = {
        pathParameters: undefined,
        headers: mockHeaders,
      } as unknown as APIGatewayEvent;

      expect(() => getDetailsHandler(event)).toThrow(InvalidRequestError);
    });

    it("handles authorization errors", async () => {
      const event = {
        pathParameters: { appId: "test", payGovTrackingId: "123" },
        headers: { Authentication: "Bearer wrong-token" },
      } as unknown as APIGatewayEvent;

      const result = await getDetailsHandler(event);

      expect(result.statusCode).toBe(403);
    });
  });
});
