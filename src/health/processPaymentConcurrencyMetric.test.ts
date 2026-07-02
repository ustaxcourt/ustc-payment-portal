import {
  emitProcessPaymentConflictMetric,
  type ProcessPaymentConflictReason,
} from "./processPaymentConcurrencyMetric";

describe("emitProcessPaymentConflictMetric", () => {
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

  it.each<ProcessPaymentConflictReason>([
    "claim_in_progress",
    "lock_not_available",
    "deadlock",
    "persist_race",
  ])("emits ProcessPaymentConflict=1 with Reason=%s", (reason) => {
    emitProcessPaymentConflictMetric(reason);

    const emf = lastEmf();
    expect(emf.ProcessPaymentConflict).toBe(1);
    expect(emf.Reason).toBe(reason);
    expect(emf.Environment).toBe("test");
    expect(emf._aws.CloudWatchMetrics[0].Namespace).toBe("USTC/PaymentPortal");
    expect(emf._aws.CloudWatchMetrics[0].Dimensions).toEqual([["Environment"]]);
  });

  it("never throws when stdout write fails", () => {
    writeSpy.mockImplementation(() => {
      throw new Error("EPIPE");
    });
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

    expect(() =>
      emitProcessPaymentConflictMetric("claim_in_progress"),
    ).not.toThrow();
    expect(logSpy).toHaveBeenCalled();

    logSpy.mockRestore();
  });
});
