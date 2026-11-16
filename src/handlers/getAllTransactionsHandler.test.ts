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

  it("keeps the legacy recent-transactions response even when query params are supplied", async () => {
    getRecentTransactions.mockResolvedValue({ data: [{ id: 3 }], total: 1 });

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
    expect(getRecentTransactions).toHaveBeenCalledWith(appContext);
    expect(getTransactionLog).not.toHaveBeenCalled();
    expect(JSON.parse(result.body)).toEqual({ data: [{ id: 3 }], total: 1 });
  });

  it("keeps legacy behavior for unknown query params", async () => {
    getRecentTransactions.mockResolvedValue({ data: [{ id: 2 }], total: 1 });

    const result = await getAllTransactionsHandler({
      queryStringParameters: { v: "1" },
      requestContext: { requestId: "req-4", identity: {} },
    } as unknown as APIGatewayEvent);

    expect(result.statusCode).toBe(200);
    expect(getRecentTransactions).toHaveBeenCalledWith(appContext);
    expect(getTransactionLog).not.toHaveBeenCalled();
    expect(JSON.parse(result.body)).toEqual({ data: [{ id: 2 }], total: 1 });
  });
});
