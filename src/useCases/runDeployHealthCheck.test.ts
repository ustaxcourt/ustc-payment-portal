import { runDeployHealthCheck } from "./runDeployHealthCheck";
import { getParameterString } from "@clients/ssmClient";
import { probePayGovWsdl } from "../health/probePayGovWsdl";
import { getKnex } from "../db/knex";
import type { AppContext } from "@appTypes/AppContext";

jest.mock("@clients/ssmClient");
jest.mock("../health/probePayGovWsdl", () => ({ probePayGovWsdl: jest.fn() }));
jest.mock("../db/knex", () => ({ getKnex: jest.fn() }));

const mockGetParam = getParameterString as jest.MockedFunction<
  typeof getParameterString
>;
const mockProbe = probePayGovWsdl as jest.MockedFunction<typeof probePayGovWsdl>;
const mockGetKnex = getKnex as jest.MockedFunction<typeof getKnex>;

const mockRaw = jest.fn();
const appContext = {
  getHttpsAgent: jest.fn(),
} as unknown as AppContext;

describe("runDeployHealthCheck", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APP_ENV = "test";
    process.env.MONITORING_SUBSCRIBERS_PARAMETER_NAME = "/ustc/pay-gov/test/x";
    (appContext.getHttpsAgent as jest.Mock).mockResolvedValue({ agent: true });
    mockGetParam.mockResolvedValue("[]");
    mockGetKnex.mockResolvedValue({ raw: mockRaw } as any);
    mockRaw.mockResolvedValue(undefined);
    mockProbe.mockResolvedValue({ ok: true, latencyMs: 1, body: "" });
  });

  it("reports healthy when every check passes", async () => {
    const report = await runDeployHealthCheck(appContext);

    expect(report.status).toBe("healthy");
    expect(report.environment).toBe("test");
    expect(
      Object.values(report.checks).every((c) => c.status === "ok"),
    ).toBe(true);
    expect(mockRaw).toHaveBeenCalledWith("SELECT 1 FROM transactions LIMIT 1");
  });

  it("fails the secrets check when no mTLS agent is configured", async () => {
    (appContext.getHttpsAgent as jest.Mock).mockResolvedValue(undefined);

    const report = await runDeployHealthCheck(appContext);

    expect(report.status).toBe("unhealthy");
    expect(report.checks.secrets.status).toBe("failed");
  });

  it("fails the ssm check when the parameter name is unset", async () => {
    delete process.env.MONITORING_SUBSCRIBERS_PARAMETER_NAME;

    const report = await runDeployHealthCheck(appContext);

    expect(report.checks.ssm.status).toBe("failed");
    expect(mockGetParam).not.toHaveBeenCalled();
  });

  it("fails the rds check when the query throws", async () => {
    mockRaw.mockRejectedValue(new Error("connection refused"));

    const report = await runDeployHealthCheck(appContext);

    expect(report.checks.rds).toMatchObject({
      status: "failed",
      error: "connection refused",
    });
  });

  it("fails the payGov check on a non-2xx WSDL response", async () => {
    mockProbe.mockResolvedValue({ ok: false, latencyMs: 1, body: "" });

    const report = await runDeployHealthCheck(appContext);

    expect(report.checks.payGov.status).toBe("failed");
  });

  it("fails more than one check while leaving the rest ok", async () => {
    mockRaw.mockRejectedValue(new Error("connection refused"));
    mockProbe.mockResolvedValue({ ok: false, latencyMs: 1, body: "" });

    const report = await runDeployHealthCheck(appContext);

    expect(report.status).toBe("unhealthy");
    expect(report.checks.rds.status).toBe("failed");
    expect(report.checks.payGov.status).toBe("failed");
    expect(report.checks.secrets.status).toBe("ok");
    expect(report.checks.ssm.status).toBe("ok");
  });

  it("reports unhealthy with every check failed when all dependencies are down", async () => {
    (appContext.getHttpsAgent as jest.Mock).mockResolvedValue(undefined);
    delete process.env.MONITORING_SUBSCRIBERS_PARAMETER_NAME;
    mockRaw.mockRejectedValue(new Error("connection refused"));
    mockProbe.mockResolvedValue({ ok: false, latencyMs: 1, body: "" });

    const report = await runDeployHealthCheck(appContext);

    expect(report.status).toBe("unhealthy");
    expect(
      Object.values(report.checks).every((c) => c.status === "failed"),
    ).toBe(true);
  });

  it("stringifies non-Error rejections", async () => {
    mockGetParam.mockRejectedValue("ssm blew up");

    const report = await runDeployHealthCheck(appContext);

    expect(report.checks.ssm).toMatchObject({
      status: "failed",
      error: "ssm blew up",
    });
  });

  it("defaults environment to 'unknown' when APP_ENV is unset", async () => {
    delete (process.env as Record<string, string | undefined>).APP_ENV;

    const report = await runDeployHealthCheck(appContext);

    expect(report.environment).toBe("unknown");
  });

  it("fails the ssm check when the parameter is not a JSON array", async () => {
    mockGetParam.mockResolvedValue('{"oops":true}');

    const report = await runDeployHealthCheck(appContext);

    expect(report.checks.ssm.status).toBe("failed");
  });

  it("reports secrets details and includes releaseTag when provided", async () => {
    delete process.env.CERT_PASSPHRASE_SECRET_ID;

    const report = await runDeployHealthCheck(appContext, "v1.2.3-dev.45");

    expect(report.releaseTag).toBe("v1.2.3-dev.45");
    expect(report.checks.secrets.details).toMatchObject({
      privateKey: true,
      certificate: true,
      passphraseConfigured: false,
    });
  });
});
