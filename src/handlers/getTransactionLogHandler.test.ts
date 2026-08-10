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

  it("routes an MM/DD/YYYY timeframe to the transaction log use case", async () => {
    getTransactionLog.mockResolvedValue({ data: [], counts: {}, total: 0 });

    const result = await getTransactionLogHandler({
      queryStringParameters: {
        from: "08/10/2026",
        to: "08/10/2026",
        status: "success",
        pageSize: "200",
      },
      requestContext: { requestId: "req-1", identity: {} },
    } as unknown as APIGatewayEvent);

    expect(result.statusCode).toBe(200);
    expect(getTransactionLog).toHaveBeenCalledWith(
      appContext,
      expect.objectContaining({
        status: "success",
        page: 1,
        pageSize: 200,
        from: new Date("2026-08-10T04:00:00.000Z"),
        to: new Date("2026-08-11T04:00:00.000Z"),
      }),
    );
  });

  it("rejects malformed timeframe input with 400", async () => {
    const result = await getTransactionLogHandler({
      queryStringParameters: {
        from: "2026-08-10",
        to: "08/10/2026",
      },
      requestContext: { requestId: "req-2", identity: {} },
    } as unknown as APIGatewayEvent);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      message: "Date must be a valid ISO datetime or MM/DD/YYYY value",
    });
    expect(getTransactionLog).not.toHaveBeenCalled();
  });
});
