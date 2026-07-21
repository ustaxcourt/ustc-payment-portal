import { runDeployHealthCheck } from "@useCases/runDeployHealthCheck";
import type { APIGatewayProxyEvent } from "aws-lambda";
import { createAppContext } from "./appContext";
import { healthHandler } from "./healthCheckHandler";

const mockInfo = jest.fn();
jest.mock("./appContext", () => ({
  createAppContext: jest.fn(() => ({
    logger: { info: mockInfo, error: jest.fn() },
  })),
}));
const mockCreateAppContext = createAppContext as jest.MockedFunction<
  typeof createAppContext
>;

jest.mock("@useCases/runDeployHealthCheck", () => ({
  runDeployHealthCheck: jest.fn(),
}));
const mockRunHealth = runDeployHealthCheck as jest.MockedFunction<
  typeof runDeployHealthCheck
>;

const event = (headers?: Record<string, string>) =>
  ({ requestContext: {}, headers } as unknown as APIGatewayProxyEvent);

describe("healthHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 with the report body when healthy", async () => {
    const report = { status: "healthy", checks: { rds: { status: "ok" } } };
    mockRunHealth.mockResolvedValue(report as never);

    const result = await healthHandler(event());

    expect(mockRunHealth).toHaveBeenCalled();
    expect(result.statusCode).toBe(200);
    expect(result.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(result.body)).toEqual(report);
  });

  it("returns 503 when a check is unhealthy", async () => {
    mockRunHealth.mockResolvedValue({ status: "unhealthy", checks: {} } as never);

    const result = await healthHandler(event());

    expect(result.statusCode).toBe(503);
  });

  it("forwards the X-Deploy-Tag header (case-insensitively) as the release tag", async () => {
    mockRunHealth.mockResolvedValue({ status: "healthy", checks: {} } as never);

    await healthHandler(event({ "X-Deploy-Tag": "v1.2.3-prod.7" }));

    expect(mockRunHealth).toHaveBeenCalledWith(
      expect.anything(),
      "v1.2.3-prod.7",
    );
  });

  it("passes the Lambda request to createAppContext for client authorization", async () => {
    mockRunHealth.mockResolvedValue({ status: "healthy", checks: {} } as never);
    const evt = event();

    await healthHandler(evt);

    expect(mockCreateAppContext).toHaveBeenCalledWith({ lambdaRequest: evt });
  });
});
