import { logger } from "../utils/logger";
import {
  emitPayGovErrorMetric,
  emitPayGovHealthMetric,
} from "./payGovHealthMetric";

describe("emitPayGovHealthMetric", () => {
  const originalEnv = process.env;
  let writeSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnv, APP_ENV: "test" };
    writeSpy = jest
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
    process.env = originalEnv;
  });

  const lastEmf = () => JSON.parse((writeSpy.mock.calls[0][0] as string).trim());

  it("emits an EMF line with PayGovHealthy=1 and latency when healthy", () => {
    emitPayGovHealthMetric(true, 42);

    const emf = lastEmf();
    expect(emf.PayGovHealthy).toBe(1);
    expect(emf.PayGovLatencyMs).toBe(42);
    expect(emf.Environment).toBe("test");
    expect(emf._aws.CloudWatchMetrics[0].Namespace).toBe("USTC/PaymentPortal");
    expect(emf._aws.CloudWatchMetrics[0].Dimensions).toEqual([["Environment"]]);
  });

  it("emits PayGovHealthy=0 when unhealthy", () => {
    emitPayGovHealthMetric(false, 1200);

    const emf = lastEmf();
    expect(emf.PayGovHealthy).toBe(0);
    expect(emf.PayGovLatencyMs).toBe(1200);
  });

  it("declares both metrics with their units", () => {
    emitPayGovHealthMetric(true, 10);

    const metrics = lastEmf()._aws.CloudWatchMetrics[0].Metrics;
    expect(metrics).toEqual([
      { Name: "PayGovHealthy", Unit: "Count" },
      { Name: "PayGovLatencyMs", Unit: "Milliseconds" },
    ]);
  });

  it("never throws, even if the underlying write fails (best-effort telemetry)", () => {
    writeSpy.mockImplementation(() => {
      throw new Error("EPIPE");
    });
    const logSpy = jest
      .spyOn(logger, "error")
      .mockImplementation((() => undefined) as never);

    expect(() => emitPayGovHealthMetric(true, 5)).not.toThrow();
    expect(logSpy).toHaveBeenCalled();

    logSpy.mockRestore();
  });
});

describe("emitPayGovErrorMetric", () => {
  const originalEnv = process.env;
  let writeSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnv, APP_ENV: "test" };
    writeSpy = jest
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
    process.env = originalEnv;
  });

  const lastEmf = () => JSON.parse((writeSpy.mock.calls[0][0] as string).trim());

  it("emits an EMF line with PayGovError=1 in the USTC/PaymentPortal namespace", () => {
    emitPayGovErrorMetric();

    const emf = lastEmf();
    expect(emf.PayGovError).toBe(1);
    expect(emf.Environment).toBe("test");
    expect(emf._aws.CloudWatchMetrics[0].Namespace).toBe("USTC/PaymentPortal");
    expect(emf._aws.CloudWatchMetrics[0].Dimensions).toEqual([["Environment"]]);
    expect(emf._aws.CloudWatchMetrics[0].Metrics).toEqual([
      { Name: "PayGovError", Unit: "Count" },
    ]);
  });
});
