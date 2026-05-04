import {
  initPaymentHandler,
  processPaymentHandler,
  getDetailsHandler,
} from "./lambdaHandler";
import { APIGatewayEvent } from "aws-lambda";
import { ForbiddenError } from "./errors/forbidden";
import { GoneError } from "./errors/gone";
import { ConflictError } from "./errors/conflict";
import { PayGovError } from "./errors/payGovError";
import { NotFoundError } from "./errors/notFound";
import * as loggerModule from "./utils/logger";

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

    it("includes and uses requestLogger for /init", async () => {
      const enrichedLogger = {
        info: jest.fn(),
        error: jest.fn(),
        child: jest.fn(),
      };
      const clientScopedLogger = {
        info: jest.fn(),
        error: jest.fn(),
      };
      const childInfo = jest.fn();
      clientScopedLogger.info = childInfo;
      enrichedLogger.child = jest.fn().mockReturnValue(clientScopedLogger);

      const requestLogger = {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
        child: jest.fn().mockReturnValue(enrichedLogger),
      };

      const mockInitPayment = jest
        .fn()
        .mockResolvedValue({ token: "test-token-123" });
      useCasesMock.initPayment = mockInitPayment;

      const createRequestLoggerSpy = jest
        .spyOn(loggerModule, "createRequestLogger")
        .mockReturnValue(
          requestLogger as unknown as ReturnType<
            typeof loggerModule.createRequestLogger
          >,
        );

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
        path: "/init",
        httpMethod: "POST",
      } as unknown as APIGatewayEvent;

      await initPaymentHandler(event);

      expect(createRequestLoggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          awsRequestId: mockRequestContext.requestId,
          path: "/init",
          httpMethod: "POST",
        }),
      );

      expect(requestLogger.debug).toHaveBeenCalledWith(
        "Received /init request",
      );
      expect(requestLogger.child).toHaveBeenCalledWith(
        expect.objectContaining({
          feeId: "PETITION_FILING_FEE",
          transactionReferenceId: "550e8400-e29b-41d4-a716-446655440000",
          metadata: { docketNumber: "123-26" },
          docketNumber: "123-26",
        }),
      );
      expect(enrichedLogger.child).toHaveBeenCalledWith(
        expect.objectContaining({
          clientName: "Test Client",
          clientArn: "arn:aws:iam::123456789012:role/dawson-client",
        }),
      );
      expect(mockInitPayment.mock.calls[0][1].requestLogger).toBe(
        clientScopedLogger,
      );
      expect(childInfo).toHaveBeenCalledWith("Authorized client for request");
      expect(childInfo).toHaveBeenCalledWith("Completed request");
    });

    it("logs receipt for malformed /init requests", async () => {
      const requestLogger = {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
        child: jest.fn(),
      };

      jest
        .spyOn(loggerModule, "createRequestLogger")
        .mockReturnValue(
          requestLogger as unknown as ReturnType<
            typeof loggerModule.createRequestLogger
          >,
        );

      const event = {
        body: null,
        headers: mockHeaders,
        requestContext: mockRequestContext,
        path: "/init",
        httpMethod: "POST",
      } as unknown as APIGatewayEvent;

      const result = await initPaymentHandler(event);

      expect(result.statusCode).toBe(400);
      expect(requestLogger.debug).toHaveBeenCalledWith("Received /init request");
      expect(requestLogger.child).not.toHaveBeenCalled();
    });

    it("logs /init failures once with request-scoped logger", async () => {
      const clientScopedLogger = {
        info: jest.fn(),
        error: jest.fn(),
      };
      const enrichedLogger = {
        info: jest.fn(),
        error: jest.fn(),
        child: jest.fn().mockReturnValue(clientScopedLogger),
      };
      const requestLogger = {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
        child: jest.fn().mockReturnValue(enrichedLogger),
      };

      useCasesMock.initPayment = jest
        .fn()
        .mockRejectedValueOnce(new ConflictError("already initiated"));

      jest
        .spyOn(loggerModule, "createRequestLogger")
        .mockReturnValue(
          requestLogger as unknown as ReturnType<
            typeof loggerModule.createRequestLogger
          >,
        );

      const globalErrorSpy = jest
        .spyOn(loggerModule.logger, "error")
        .mockImplementation(() => loggerModule.logger as any);

      try {
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
          path: "/init",
          httpMethod: "POST",
        } as unknown as APIGatewayEvent;

        const result = await initPaymentHandler(event);

        expect(result.statusCode).toBe(409);
        expect(clientScopedLogger.error).toHaveBeenCalledWith(
          { err: expect.any(ConflictError) },
          "responding with an error",
        );
        expect(globalErrorSpy).not.toHaveBeenCalled();
      } finally {
        globalErrorSpy.mockRestore();
      }
    });
  });

  it("returns 409 when init payment use case throws ConflictError", async () => {
    useCasesMock.initPayment = jest
      .fn()
      .mockRejectedValueOnce(
        new ConflictError(
          "A payment session is already initiated for this transactionReferenceId",
        ),
      );

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

    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body).message).toContain("already initiated");
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
    const validUuid = "550e8400-e29b-41d4-a716-446655440000";

    it("returns 200 with the new response shape on a valid UUID", async () => {
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
      expect(body.transactions).toHaveLength(1);
      expect(body.transactions[0].transactionStatus).toBe("processed");
    });

    it("returns 400 when transactionReferenceId is not a valid UUID", async () => {
      const event = {
        pathParameters: { transactionReferenceId: "not-a-uuid" },
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await getDetailsHandler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe(
        "Transaction Reference Id was invalid",
      );
    });

    it("returns 400 when pathParameters are missing", async () => {
      const event = {
        pathParameters: null,
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await getDetailsHandler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe(
        "Transaction Reference Id was invalid",
      );
    });

    it("returns 400 when pathParameters are undefined", async () => {
      const event: APIGatewayEvent = {
        pathParameters: undefined,
        headers: mockHeaders,
        requestContext: mockRequestContext,
      } as unknown as APIGatewayEvent;

      const result = await getDetailsHandler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe(
        "Transaction Reference Id was invalid",
      );
    });

    it("returns 404 when use case throws NotFoundError", async () => {
      useCasesMock.getDetails.mockRejectedValueOnce(
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

    it("returns 403 when use case throws ForbiddenError (cross-client)", async () => {
      useCasesMock.getDetails.mockRejectedValueOnce(
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
      expect(JSON.parse(result.body).message).toBe(
        "You are not authorized to get details for this transaction.",
      );
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
});
