import type { APIGatewayEvent } from "aws-lambda";
import type { AppContext } from "@appTypes/AppContext";
import { createAppContext } from "../appContext";
import { getTransactionLogHandler } from "./getTransactionLogHandler";
import { testAppContext } from "../test/testAppContext";

jest.mock("../appContext", () => ({
  createAppContext: jest.fn(),
}));

const mockCreateAppContext = createAppContext as jest.MockedFunction<
  typeof createAppContext
>;

describe("getTransactionLogHandler", () => {
  const getTransactionLog = jest.fn();
  const transactionLogResponse = {
    data: [
      {
        agencyTrackingId: "24cfd28543f945c38e1a0",
        paygovTrackingId: null,
        feeName: "Petition Filing Fee",
        fee: "PETITION_FILING_FEE",
        transactionAmount: 60,
        clientName: "CI/CD Integration Tests",
        transactionReferenceId: "550e8400-e29b-41d4-a716-446655440000",
        paymentStatus: "pending",
        transactionStatus: "received",
        paygovToken: null,
        metadata: {
          docketNumber: "123-26",
        },
        createdAt: "2026-08-19T17:26:35.841Z",
        lastUpdatedAt: "2026-08-19T17:26:35.841Z",
        returnCode: null,
        returnDetail: null,
      },
    ],
    counts: {
      all: 68,
      success: 49,
      failed: 14,
      pending: 5,
    },
    from: "2026-08-13T04:00:00.000Z",
    to: "2026-08-20T04:00:00.000Z",
    page: 1,
    pageSize: 200,
    sort: "createdAt",
    order: "desc",
    total: 68,
  };
  const appContext = {
    ...testAppContext,
    getUseCases: () => ({
      ...testAppContext.getUseCases(),
      getTransactionLog,
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DASHBOARD_ALLOWED_ORIGIN = "http://localhost:3000";
    mockCreateAppContext.mockReturnValue(appContext as AppContext);
  });

  it("parses the dashboard timeframe query and returns the use-case response", async () => {
    getTransactionLog.mockResolvedValue(transactionLogResponse);

    const result = await getTransactionLogHandler({
      queryStringParameters: {
        from: "08/13/2026",
        to: "08/19/2026",
        order: "desc",
        page: "1",
        pageSize: "200",
        sort: "createdAt",
      },
      requestContext: { requestId: "req-1", identity: {} },
    } as unknown as APIGatewayEvent);

    expect(result.statusCode).toBe(200);
    expect(getTransactionLog).toHaveBeenCalledWith(
      appContext,
      expect.objectContaining({
        from: new Date("2026-08-13T04:00:00.000Z"),
        to: new Date("2026-08-20T04:00:00.000Z"),
        order: "desc",
        page: 1,
        pageSize: 200,
        sort: "createdAt",
      }),
    );
    expect(JSON.parse(result.body)).toEqual(transactionLogResponse);
  });

  it("routes a winter MM/DD/YYYY timeframe using EST midnight bounds", async () => {
    getTransactionLog.mockResolvedValue({ data: [], counts: {}, total: 0 });

    const result = await getTransactionLogHandler({
      queryStringParameters: {
        from: "12/10/2026",
        to: "12/10/2026",
      },
      requestContext: { requestId: "req-1b", identity: {} },
    } as unknown as APIGatewayEvent);

    expect(result.statusCode).toBe(200);
    expect(getTransactionLog).toHaveBeenCalledWith(
      appContext,
      expect.objectContaining({
        from: new Date("2026-12-10T05:00:00.000Z"),
        to: new Date("2026-12-11T05:00:00.000Z"),
      }),
    );
  });

  it("rejects malformed timeframe input with 400", async () => {
    const result = await getTransactionLogHandler({
      queryStringParameters: {
        from: "2026-08-10",
        to: "08-10-2026",
      },
      requestContext: { requestId: "req-2", identity: {} },
    } as unknown as APIGatewayEvent);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.message).toBe("Validation error");
    expect(body.errors).toHaveLength(2);
    expect(getTransactionLog).not.toHaveBeenCalled();
  });
});
