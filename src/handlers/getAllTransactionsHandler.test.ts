import type { APIGatewayEvent } from "aws-lambda";
import type { AppContext } from "@appTypes/AppContext";
import { createAppContext } from "../appContext";
import { getAllTransactionsHandler } from "./getAllTransactionsHandler";
import { testAppContext } from "../test/testAppContext";

jest.mock("../appContext", () => ({
  createAppContext: jest.fn(),
}));

const mockCreateAppContext = createAppContext as jest.MockedFunction<
  typeof createAppContext
>;

describe("getAllTransactionsHandler", () => {
  const getRecentTransactions = jest.fn();
  const getTransactionLog = jest.fn();
  const appContext = {
    ...testAppContext,
    getUseCases: () => ({
      ...testAppContext.getUseCases(),
      getRecentTransactions,
      getTransactionLog,
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DASHBOARD_ALLOWED_ORIGIN = "http://localhost:3000";
    mockCreateAppContext.mockReturnValue(appContext as AppContext);
  });

  it("returns the legacy recent-transactions response when no query is supplied", async () => {
    getRecentTransactions.mockResolvedValue({ data: [{ id: 1 }], total: 1 });

    const result = await getAllTransactionsHandler({
      queryStringParameters: null,
      requestContext: { requestId: "req-1", identity: {} },
    } as unknown as APIGatewayEvent);

    expect(result.statusCode).toBe(200);
    expect(getRecentTransactions).toHaveBeenCalledWith(appContext);
    expect(getTransactionLog).not.toHaveBeenCalled();
    expect(JSON.parse(result.body)).toEqual({ data: [{ id: 1 }], total: 1 });
  });

  it("routes queried requests to the transaction log use case", async () => {
    getTransactionLog.mockResolvedValue({ data: [], counts: {}, total: 0 });

    const result = await getAllTransactionsHandler({
      queryStringParameters: {
        from: "08/10/2026",
        to: "08/10/2026",
        status: "pending",
        pageSize: "200",
      },
      requestContext: { requestId: "req-2", identity: {} },
    } as unknown as APIGatewayEvent);

    expect(result.statusCode).toBe(200);
    expect(getTransactionLog).toHaveBeenCalledWith(
      appContext,
      expect.objectContaining({
        status: "pending",
        page: 1,
        pageSize: 200,
        from: new Date("2026-08-10T04:00:00.000Z"),
        to: new Date("2026-08-11T04:00:00.000Z"),
      }),
    );
    expect(getRecentTransactions).not.toHaveBeenCalled();
  });

  it("rejects malformed date ranges with 400", async () => {
    const result = await getAllTransactionsHandler({
      queryStringParameters: { from: "2026-08-10", to: "08/10/2026" },
      requestContext: { requestId: "req-3", identity: {} },
    } as unknown as APIGatewayEvent);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      message: "Date must be a valid MM/DD/YYYY value",
    });
    expect(getRecentTransactions).not.toHaveBeenCalled();
    expect(getTransactionLog).not.toHaveBeenCalled();
  });
});
