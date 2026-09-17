import type { APIGatewayEvent } from "aws-lambda";
import { createAppContext } from "../appContext";
import { getRevenueSummaryHandler } from "./getRevenueSummaryHandler";
import { testAppContext } from "../test/testAppContext";

jest.mock("../appContext", () => ({
  createAppContext: jest.fn(),
}));

const mockCreateAppContext = createAppContext as jest.MockedFunction<
  typeof createAppContext
>;

describe("getRevenueSummaryHandler", () => {
  const getRevenueSummary = jest.fn();
  const appContext = {
    ...testAppContext,
    getUseCases: () => ({
      ...testAppContext.getUseCases(),
      getRevenueSummary,
    }),
  };

  const event = (queryStringParameters: Record<string, string> | null) =>
    ({ queryStringParameters }) as unknown as APIGatewayEvent;

  beforeEach(() => {
    process.env.DASHBOARD_ALLOWED_ORIGIN = "http://localhost:3000";
    mockCreateAppContext.mockReturnValue(appContext);
    getRevenueSummary.mockResolvedValue({ totals: {} });
  });

  afterEach(() => jest.resetAllMocks());

  it("returns the summary on a bare request", async () => {
    const result = await getRevenueSummaryHandler(event(null));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ totals: {} });
  });

  it("rejects any query parameter with a 400", async () => {
    const result = await getRevenueSummaryHandler(
      event({ includeAnything: "true" }),
    );

    expect(result.statusCode).toBe(400);
    expect(getRevenueSummary).not.toHaveBeenCalled();
  });

  it("returns a 500 without leaking the failure", async () => {
    getRevenueSummary.mockRejectedValue(new Error("db down"));

    const result = await getRevenueSummaryHandler(event(null));

    expect(result.statusCode).toBe(500);
    expect(result.body).not.toContain("db down");
  });
});
