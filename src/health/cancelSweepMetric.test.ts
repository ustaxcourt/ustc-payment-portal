import { emitCancelSweepMetric } from "./cancelSweepMetric";

describe("emitCancelSweepMetric", () => {
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

  it("emits the cancelled count under the shared namespace", () => {
    emitCancelSweepMetric(7);

    const emf = lastEmf();
    expect(emf.TransactionsCancelled).toBe(7);
    expect(emf.Environment).toBe("test");
    expect(emf._aws.CloudWatchMetrics[0].Namespace).toBe("USTC/PaymentPortal");
    expect(emf._aws.CloudWatchMetrics[0].Dimensions).toEqual([["Environment"]]);
  });

  // A quiet sweep must still emit, or the alarm cannot tell "nothing expired" from
  // "the sweeper stopped running".
  it("emits a zero for a sweep that cancelled nothing", () => {
    emitCancelSweepMetric(0);

    expect(lastEmf().TransactionsCancelled).toBe(0);
  });
});
